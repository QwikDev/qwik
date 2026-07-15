/**
 * Transform `jsx(Tag, propsObj)` / `jsxs(...)` / `jsxDEV(...)` CallExpressions
 * into `_jsxSorted(...)` / `_jsxSplit(...)` form — the pre-transformed JSX path,
 * where a bundler (esbuild/oxc) or peer tool (`qwik-react` codegen) lowers
 * `<Tag ... />` to a JSX-factory call before the optimizer runs.
 */

import type MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';
import { someAstChild } from '../ast/guards.js';
import {
  computeJsxFlags,
  collectScopeAwareBindings,
  isConstBindingName,
  type ScopeAwareBindings,
  type JsxKeyCounter,
} from './jsx.js';
import { transformEventPropName } from './event-handlers.js';
import { buildCaptureProp } from './loop-hoisting.js';
import { analyzeSignalExpression, type SignalHoister } from './signal-analysis.js';
import type { SegmentImportData } from '../segment/segment-codegen.js';

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Collect the set of identifier names in this segment's import context that
 * resolve to a JSX-runtime function. Mirrors `transform.rs:235-238`:
 *   - Named import `jsx` / `jsxs` / `jsxDEV` from `@qwik.dev/core` (any name).
 *   - Anything imported from `@qwik.dev/core/jsx-runtime` or
 *     `@qwik.dev/core/jsx-dev-runtime` (any imported name; the local alias
 *     is what we care about).
 */
export function collectJsxFunctionNames(importContext: SegmentImportData): Set<string> {
  return collectJsxFunctionNamesFromIterable(importContext.moduleImports);
}

/**
 * Variant that operates on the structural minimum needed for the rule —
 * lets callers with `ImportInfo[]` (e.g. parent-rewrite under inline strategy)
 * reuse the same classification without first converting to `SegmentImportData`.
 */
export function collectJsxFunctionNamesFromIterable(
  imports: Iterable<{ readonly localName: string; readonly importedName: string; readonly source: string }>,
): Set<string> {
  const result = new Set<string>();
  for (const imp of imports) {
    if (
      imp.source === '@qwik.dev/core/jsx-runtime' ||
      imp.source === '@qwik.dev/core/jsx-dev-runtime'
    ) {
      result.add(imp.localName);
      continue;
    }
    if (
      (imp.source === '@qwik.dev/core' || imp.source === '@builder.io/qwik') &&
      (imp.importedName === 'jsx' || imp.importedName === 'jsxs' || imp.importedName === 'jsxDEV')
    ) {
      result.add(imp.localName);
    }
  }
  return result;
}

interface JsxCallTransformOptions {
  jsxFunctions: Set<string>;
  keyCounter: JsxKeyCounter;
  neededImports: Set<string>;
  /** Reactive bindings (`useStore`/`useSignal`/...) that drive the
   * `_wrapProp(...)` rewrite + `isStaticChildren` classification. Empty/absent
   * means no signal analysis. */
  reactiveBindings?: ReadonlySet<string>;
  /**
   * Byte ranges to skip during the walk. Used by the parent-rewrite path
   * so jsx() calls already inside a marker extraction's argument tree
   * (where the parent emits `q_<sym>` and segment-codegen handles the
   * jsx-call rewrite separately) are not double-transformed. Each range
   * is `[start, end)`; calls whose start byte lies inside any range are
   * left alone.
   */
  skipRanges?: ReadonlyArray<{ readonly start: number; readonly end: number }>;
  /**
   * Maps an event-handler QRL var name (`q_<sym>`) to the lexical-capture
   * params the runtime must deliver to it positionally — the handler's
   * params after the `_, _1` (event, element) prefix. When a const event
   * handler on an element references one of these, `buildJsxSortedCall`
   * injects the element's `q:p`/`q:ps` prop so the runtime passes the
   * captures through. Mirrors the raw-JSX path's `injectQpProp`.
   */
  qpByQrl?: ReadonlyMap<string, readonly string[]>;
  /** All names imported by the module; lets the reactive classifier tell
   * signal reads apart from references to imports. */
  importedNames?: ReadonlySet<string>;
  /** Accumulates `_hf<n>` functions hoisted for `_fnSignal(...)` values;
   * threaded across bodies for stable `_hf<n>` numbering. */
  signalHoister?: SignalHoister;
  /** Locally declared names in this body; a dep declared locally isn't
   * treated as a signal/store read. */
  localNames?: ReadonlySet<string>;
  /** Scope-aware binding lookup; a reactive prop whose deps are all stable
   * (imported or const-bound) goes in the const bag. */
  bindings?: ScopeAwareBindings;
  /** The body's closure params. Member reads on them (`props.field`) are
   * wrappable store-field reads even with no `useSignal`/`useStore` binding. */
  paramNames?: readonly string[];
}

/**
 * Walk a parsed program (typically a segment body wrapped in `(...)` to make
 * it parseable as an Expression) and rewrite every `jsx(Tag, propsObj, ...)`
 * call whose callee is in `jsxFunctions` into the `_jsxSorted(...)` form.
 *
 * Two traversals: a gather walk for reactive bindings (a `const X = use*()`
 * declaration can appear after the first jsx() call in document order, so
 * the set must be complete before any wrap decision), then one act walk
 * whose enter phase wraps reactive accesses (`X.prop` →
 * `_wrapProp(X, "prop")`) and records each call's direct jsx children, and
 * whose leave phase rewrites calls bottom-up — inner calls are rewritten
 * before outer calls, so when the outer's source text is sliced (for tag /
 * children), it contains the already-rewritten inner call text.
 *
 * Keying: a component element is always keyed; an HTML element is keyed only
 * when it is not a direct jsx child of another jsx element — a render root,
 * or an element reached through an expression boundary (`&&` / ternary /
 * `.map` / an arrow or loop body). A direct HTML child takes `null`. An
 * explicit key is reused only from the 3-argument `jsx(tag, props, key)`
 * form; the 6-argument dev form's trailing key/source arguments are ignored.
 *
 * Mutates `s` (the MagicString of the parsed source) and `opts.neededImports`.
 */
export function transformJsxCalls(
  source: string,
  s: MagicString,
  program: AstProgram,
  opts: JsxCallTransformOptions,
): void {
  if (opts.jsxFunctions.size === 0) return;

  const skipRanges = opts.skipRanges ?? [];
  const isInSkipRange = (start: number): boolean => {
    for (const r of skipRanges) {
      if (start >= r.start && start < r.end) return true;
    }
    return false;
  };

  const reactiveBindings = collectReactiveBindings(program);
  opts.reactiveBindings = reactiveBindings;
  const scopeBindings = collectScopeAwareBindings(program);
  const localNames = scopeBindings.allLocalNames;
  // Closure params aren't declarations in the parsed body (codegen wraps it in
  // `(props) =>` afterward), so union them in — member reads on them are
  // store-field reads the wrap pass must recognise.
  for (const p of opts.paramNames ?? []) localNames.add(p);
  opts.localNames = localNames;
  opts.bindings = scopeBindings.bindings;

  const directJsxChildStarts = new Set<number>();

  walk(program, {
    enter(node: AstNode) {
      if (!isJsxCall(node, opts.jsxFunctions) || node.type !== 'CallExpression') return;

      markDirectJsxChildren(node, opts.jsxFunctions, directJsxChildStarts);

      if (reactiveBindings.size === 0 && (opts.paramNames?.length ?? 0) === 0) return;
      if (isInSkipRange(node.start)) return;
      const propsArg = node.arguments?.[1];
      if (!propsArg || propsArg.type !== 'ObjectExpression') return;
      wrapReactivePropValues(propsArg, {
        s,
        source,
        importedNames: opts.importedNames ?? EMPTY_SET,
        localNames,
        neededImports: opts.neededImports,
        signalHoister: opts.signalHoister,
      });
    },
    leave(node: AstNode) {
      if (!isJsxCall(node, opts.jsxFunctions) || node.type !== 'CallExpression') return;

      if (isInSkipRange(node.start)) return;

      const isDirectJsxChild = directJsxChildStarts.has(node.start);
      const rewritten = buildJsxSortedCall(s, node, opts, isDirectJsxChild);
      if (rewritten !== null) {
        s.overwrite(node.start, node.end, rewritten);
      }
    },
  });
}

/**
 * Collect names of `const X = use*(...)` declarations — the reactive sources
 * (`useStore`, `useSignal`, `useComputed`, `useResource`, etc.) whose field
 * accesses inside JSX need `_wrapProp` wrapping for runtime reactivity.
 *
 * Conservative — any local const assigned to a `use*()` call qualifies. The
 * wrap only fires on identifiers in this set when they appear as the object
 * of a MemberExpression INSIDE a jsx() call's argument tree (not inside
 * nested function bodies — see `wrapReactiveAccessesInJsxCalls`).
 */
function collectReactiveBindings(program: AstProgram): Set<string> {
  const result = new Set<string>();
  walk(program, {
    enter(node: AstNode) {
      if (node.type !== 'VariableDeclaration') return;
      for (const decl of node.declarations ?? []) {
        if (decl.id?.type !== 'Identifier') continue;
        if (decl.init?.type !== 'CallExpression') continue;
        const callee = decl.init.callee;
        if (callee?.type !== 'Identifier') continue;
        if (callee.name.startsWith('use')) result.add(decl.id.name);
      }
    },
  });
  return result;
}

function isJsxCall(node: AstNode, jsxFunctions: ReadonlySet<string>): boolean {
  return (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    jsxFunctions.has(node.callee.name) &&
    !!node.arguments &&
    node.arguments.length >= 2 &&
    node.arguments[1]?.type === 'ObjectExpression'
  );
}

function markDirectJsxChildren(
  node: AstNode,
  jsxFunctions: ReadonlySet<string>,
  out: Set<number>,
): void {
  if (node.type !== 'CallExpression') return;
  const propsArg = node.arguments?.[1];
  if (!propsArg || propsArg.type !== 'ObjectExpression') return;
  for (const prop of propsArg.properties ?? []) {
    if (prop.type !== 'Property' || prop.computed) continue;
    if (propertyKeyName(prop) !== 'children') continue;
    const value = prop.value;
    if (isJsxCall(value, jsxFunctions)) {
      out.add(value.start);
    } else if (value?.type === 'ArrayExpression') {
      for (const el of value.elements ?? []) {
        if (el && isJsxCall(el, jsxFunctions)) out.add(el.start);
      }
    }
    return;
  }
}

interface WrapReactiveContext {
  s: MagicString;
  source: string;
  importedNames: ReadonlySet<string>;
  localNames: ReadonlySet<string> | undefined;
  neededImports: Set<string>;
  signalHoister: SignalHoister | undefined;
}

function wrapReactivePropValues(propsObj: AstNode, ctx: WrapReactiveContext): void {
  if (propsObj.type !== 'ObjectExpression') return;
  for (const prop of propsObj.properties ?? []) {
    if (prop.type !== 'Property') continue;
    const key = propertyKeyName(prop);
    if (isHandlerPropKey(key)) continue;
    const value = prop.value;
    if (key === 'children' && value?.type === 'ArrayExpression') {
      for (const element of value.elements ?? []) {
        wrapReactiveValue(element, ctx);
      }
      continue;
    }
    wrapReactiveValue(value, ctx);
  }
}

function isHandlerPropKey(key: string | null): boolean {
  return key !== null && key.endsWith('$');
}

function isDollarSuffixedMemberRead(node: AstNode): boolean {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.type === 'Identifier' &&
    node.property.name.endsWith('$')
  );
}

function wrapReactiveValue(node: AstNode | null | undefined, ctx: WrapReactiveContext): void {
  if (!node) return;
  if (isDollarSuffixedMemberRead(node)) return;
  const result = analyzeSignalExpression(
    node,
    ctx.source,
    ctx.importedNames as Set<string>,
    ctx.localNames as Set<string> | undefined,
  );
  if (result.type === 'wrapProp') {
    ctx.s.overwrite(node.start, node.end, result.code);
    ctx.neededImports.add('_wrapProp');
    return;
  }
  if (result.type === 'fnSignal' && ctx.signalHoister !== undefined && isHoistableSignalExpr(node)) {
    const hf = ctx.signalHoister.hoist(result.hoistedFn, result.hoistedStr, node.start ?? 0);
    ctx.s.overwrite(node.start, node.end, `_fnSignal(${hf}, [${result.deps.join(', ')}], ${hf}_str)`);
    ctx.neededImports.add('_fnSignal');
  }
}

/** Only scalar reactive expressions hoist to `_fnSignal`; arrays/objects and
 * call/chain exprs (`items.map(...)`) stay verbatim — hoisting them would
 * strand their callback bindings. */
function isHoistableSignalExpr(node: AstNode): boolean {
  return (
    node.type !== 'ArrayExpression' &&
    node.type !== 'ObjectExpression' &&
    node.type !== 'CallExpression' &&
    node.type !== 'ChainExpression'
  );
}

/** Which prop bag a `_jsxDEV` prop value belongs in. A reactive-wrapped value
 * goes in the const bag so only its wrapper subscribes, not the host (a var-bag
 * reactive read re-renders the whole component on a mid-render write). A
 * store-field read on an HTML element keeps its var/const split by the object's
 * binding. Everything else — including non-reactive props carrying pre-analysed
 * peer-tool markers (`[_IMMUTABLE]`) — stays in the var bag. */
function classifyProp(
  valueNode: AstNode,
  opts: JsxCallTransformOptions,
  isHtmlTag: boolean,
  s: MagicString,
): 'const' | 'var' {
  const importedNames = (opts.importedNames ?? EMPTY_SET) as Set<string>;
  const bindings = opts.bindings;
  const localNames = opts.localNames as Set<string> | undefined;
  const pos = valueNode.start ?? 0;
  if (isDollarSuffixedMemberRead(valueNode)) return 'var';
  const sig = analyzeSignalExpression(valueNode, s.original, importedNames, localNames);

  if (sig.type === 'wrapProp') {
    if (sig.isStoreField && isHtmlTag) {
      const objName = sig.code.match(/_wrapProp\((\w+)/)?.[1] ?? null;
      return isConstBindingName(objName, importedNames, bindings, pos) ? 'const' : 'var';
    }
    return 'const';
  }

  if (
    sig.type === 'fnSignal' &&
    opts.signalHoister !== undefined &&
    isHoistableSignalExpr(valueNode)
  ) {
    const depsAllConst = sig.deps.every(
      (dep) => importedNames.has(dep) || bindings?.classify(dep, pos) === 'const',
    );
    return depsAllConst ? 'const' : 'var';
  }

  return 'var';
}

function constBagEligible(
  valueNode: AstNode,
  opts: JsxCallTransformOptions,
  isHtmlTag: boolean,
  reactiveConst: boolean,
  s: MagicString,
): boolean {
  if (reactiveConst || isConstExpr(valueNode, opts)) return true;
  if (isHtmlTag) return false;
  const importedNames = (opts.importedNames ?? EMPTY_SET) as Set<string>;
  const localNames = opts.localNames as Set<string> | undefined;
  const sig = analyzeSignalExpression(valueNode, s.original, importedNames, localNames);
  if (sig.type === 'wrapProp') return true;
  return sig.type === 'fnSignal' && opts.signalHoister !== undefined && isHoistableSignalExpr(valueNode);
}

function isConstExpr(node: AstNode, opts: JsxCallTransformOptions): boolean {
  const importedNames = (opts.importedNames ?? EMPTY_SET) as Set<string>;
  const bindings = opts.bindings;
  const check = (n: AstNode): boolean => {
    if (n.type === 'CallExpression' || n.type === 'MemberExpression') return false;
    if (n.type === 'ArrowFunctionExpression') return true;
    if (n.type === 'Identifier') {
      return isConstBindingName(n.name, importedNames, bindings, n.start ?? 0);
    }
    return !someAstChild(n, (child, key, parent) => isValueChild(key, parent) && !check(child));
  };
  return check(node);
}

function isValueChild(key: string, parent: AstNode): boolean {
  return !(key === 'key' && parent.type === 'Property' && !parent.computed);
}

function staticPropName(member: AstNode): string | null {
  if (member.type !== 'MemberExpression' || !member.property) return null;
  if (!member.computed && member.property.type === 'Identifier') return member.property.name;
  if (
    member.computed &&
    member.property.type === 'Literal' &&
    typeof member.property.value === 'string'
  ) return member.property.value;
  return null;
}

/**
 * `isConst` picks the bag the prop lands in; `rawConst` is const-ness of the
 * raw value (governs a following spread's merge). They differ for a component's
 * reactive prop — const bag, yet its member-read value isn't a const expression.
 */
type PropSlot =
  | { readonly kind: 'spread'; readonly getVar: string; readonly getConst: string }
  | {
      readonly kind: 'named';
      readonly text: string;
      readonly isConst: boolean;
      readonly rawConst: boolean;
    };

/**
 * Partition a spread-carrying prop list into `_jsxSplit`'s var/const bags. A
 * named prop before any remaining spread is var even when statically const — a
 * later spread can override it; a prop after all spreads keeps its static bag.
 */
function partitionSpreadProps(slots: readonly PropSlot[]): {
  varBag: string[];
  constBag: string[];
} {
  const lastSpreadIndex = slots.reduce(
    (acc, slot, i) => (slot.kind === 'spread' ? i : acc),
    -1,
  );
  const hasVarPropAfterLastSpread = slots.some(
    (slot, i) => i > lastSpreadIndex && slot.kind === 'named' && !slot.rawConst,
  );

  let spreadRemaining = slots.filter((slot) => slot.kind === 'spread').length;
  const varBag: string[] = [];
  const constBag: string[] = [];
  for (const slot of slots) {
    if (slot.kind === 'spread') {
      varBag.push(slot.getVar);
      if (spreadRemaining > 1 || hasVarPropAfterLastSpread) varBag.push(slot.getConst);
      else constBag.push(slot.getConst);
      spreadRemaining--;
    } else if (spreadRemaining > 0 || !slot.isConst) {
      varBag.push(slot.text);
    } else {
      constBag.push(slot.text);
    }
  }
  return { varBag, constBag };
}

function renderConstBag(constBag: readonly string[]): string {
  if (constBag.length === 0) return 'null';
  if (constBag.length === 1 && constBag[0].startsWith('..._getConstProps(')) {
    return constBag[0].slice('...'.length);
  }
  return `{ ${constBag.join(', ')} }`;
}

function buildJsxSortedCall(
  s: MagicString,
  callNode: AstNode,
  opts: JsxCallTransformOptions,
  isDirectJsxChild: boolean,
): string | null {
  // Caller already gates on `callNode.type === 'CallExpression'` and
  // `arguments[1].type === 'ObjectExpression'`. The CallExpression check
  // here is required for type-checker narrowing before destructuring; the
  // combined guard after it covers the rest. Tag arg cannot be a
  // SpreadElement (that'd be `jsx(...tag, ...)` — never emitted by peer
  // tools).
  if (callNode.type !== 'CallExpression') return null;
  const args = callNode.arguments;
  const tagArg = args[0];
  const propsArg = args[1];
  if (
    !tagArg ||
    tagArg.type === 'SpreadElement' ||
    !propsArg ||
    propsArg.type !== 'ObjectExpression'
  ) return null;

  const tag = s.slice(tagArg.start, tagArg.end);
  // HTML tags are string-literal first args (`jsx("button", ...)`); component
  // tags are identifiers (`jsx(MyCmp, ...)`). Event-handler key rewriting
  // (`onClick$` → `"q-e:click"`) only applies to HTML — components receive
  // the `*$` form as a JSX prop and the runtime handles wiring internally.
  const isHtmlTag = tagArg.type === 'Literal' && typeof tagArg.value === 'string';

  // Non-Property/SpreadElement props (e.g. a setter) are out of scope — bail.
  let childrenText: string | null = null;
  let childrenIsDynamic = false;
  let hasVarEventHandler = false;
  const varEntries: string[] = [];
  const constEntries: string[] = [];
  const slots: PropSlot[] = [];
  const spreadArgs: string[] = [];
  // Union of `q:p`/`q:ps` capture params across all const event handlers on
  // this element (an element with two capturing handlers shares one prop).
  const qpParams: string[] = [];
  for (const prop of propsArg.properties) {
    if (prop.type === 'SpreadElement') {
      const spreadArg = s.slice(prop.argument.start, prop.argument.end);
      spreadArgs.push(spreadArg);
      slots.push({
        kind: 'spread',
        getVar: `..._getVarProps(${spreadArg})`,
        getConst: `..._getConstProps(${spreadArg})`,
      });
      continue;
    }
    if (prop.type !== 'Property') return null;
    const keyName = propertyKeyName(prop);
    if (keyName === 'children' && !prop.computed) {
      const value = prop.value;
      childrenText = s.slice(value.start, value.end);
      childrenIsDynamic = !isStaticChildren(value, opts.reactiveBindings ?? new Set());
      continue;
    }
    if (prop.shorthand === true) {
      const entryText = s.slice(prop.start, prop.end);
      varEntries.push(entryText);
      slots.push({ kind: 'named', text: entryText, isConst: false, rawConst: false });
      if (isHandlerPropKey(keyName)) hasVarEventHandler = true;
      continue;
    }
    // Rewrite event-handler prop keys on HTML tags from the marker form
    // (`onClick$`) to the runtime form (`"q-e:click"`). Mirrors what
    // `transformAllJsx` does for JSX syntax.
    if (isHtmlTag && keyName !== null) {
      const transformed = transformEventPropName(keyName, new Set());
      if (transformed !== null) {
        const valueText = s.slice(prop.value.start, prop.value.end);
        // A const event handler — a bare QRL ref (`q_X`) or `q_X.w([…])` —
        // belongs in the CONST props bag (3rd `_jsxSorted` arg), matching
        // SWC and the `static_listeners` flag. Emitting it in the VAR bag
        // while the flag claims static listeners leaves the runtime looking
        // in the const bag, finding nothing, and never wiring the event.
        // Anything else (an inline arrow, a computed value) is a var handler
        // and drops the flag bit.
        const eventEntry = `"${transformed}": ${valueText}`;
        const rawConst = isConstExpr(prop.value, opts);
        if (isConstEventHandlerValue(prop.value)) {
          constEntries.push(eventEntry);
          slots.push({ kind: 'named', text: eventEntry, isConst: true, rawConst });
          // A const handler delivers its captures positionally; record them
          // so the element emits one `q:p`/`q:ps` prop below.
          const handlerQp = opts.qpByQrl?.get(valueText);
          if (handlerQp) {
            for (const p of handlerQp) {
              if (!qpParams.includes(p)) qpParams.push(p);
            }
          }
        } else {
          varEntries.push(eventEntry);
          slots.push({ kind: 'named', text: eventEntry, isConst: false, rawConst });
          hasVarEventHandler = true;
        }
        continue;
      }
    }
    if (isHandlerPropKey(keyName)) {
      const handlerText = s.slice(prop.start, prop.end);
      const isConst = isConstEventHandlerValue(prop.value);
      slots.push({ kind: 'named', text: handlerText, isConst, rawConst: isConstExpr(prop.value, opts) });
      if (isConst) {
        constEntries.push(handlerText);
      } else {
        varEntries.push(handlerText);
        hasVarEventHandler = true;
      }
      continue;
    }
    const entryText = s.slice(prop.start, prop.end);
    const reactiveConst = classifyProp(prop.value, opts, isHtmlTag, s) === 'const';
    (reactiveConst ? constEntries : varEntries).push(entryText);
    slots.push({
      kind: 'named',
      text: entryText,
      isConst: constBagEligible(prop.value, opts, isHtmlTag, reactiveConst, s),
      rawConst: isConstExpr(prop.value, opts),
    });
  }

  const shouldEmitKey = !isHtmlTag || !isDirectJsxChild;
  let keyText: string;
  if (args.length === 3 && args[2] && args[2].type !== 'SpreadElement') {
    // An explicit user key rides only on the 3-arg call form; the dev form's
    // trailing key/source arguments are synthetic and carry no key.
    keyText = s.slice(args[2].start, args[2].end);
  } else if (shouldEmitKey) {
    keyText = `"${opts.keyCounter.next()}"`;
  } else {
    keyText = 'null';
  }

  // The element's `q:p`/`q:ps` capture prop goes in the VAR bag (the captured
  // values can change between renders), ahead of any other var props —
  // matching SWC's emit order. Its presence sets the `moved_captures` flag.
  let qpEntry: string | null = null;
  if (qpParams.length > 0) {
    const qp = buildCaptureProp(qpParams, true);
    if (qp) {
      qpEntry = `"${qp.propName}": ${qp.propValue}`;
      varEntries.unshift(qpEntry);
    }
  }

  const childrenSlot = childrenText ?? 'null';
  const childrenType: 'none' | 'static' | 'dynamic' = childrenText === null
    ? 'none'
    : childrenIsDynamic ? 'dynamic' : 'static';

  if (spreadArgs.length > 0) {
    opts.neededImports.add('_jsxSplit');
    opts.neededImports.add('_getVarProps');
    opts.neededImports.add('_getConstProps');
    const { varBag, constBag } = partitionSpreadProps(slots);
    if (qpEntry !== null) varBag.unshift(qpEntry);
    const varPropsPart = varBag.length > 0 ? `{ ${varBag.join(', ')} }` : 'null';
    const constPropsPart = renderConstBag(constBag);
    const splitFlags = qpParams.length > 0 ? 4 : 0;
    return `/*#__PURE__*/ _jsxSplit(${tag}, ${varPropsPart}, ${constPropsPart}, ${childrenSlot}, ${splitFlags}, ${keyText})`;
  }

  const varPropsText = varEntries.length > 0 ? `{ ${varEntries.join(', ')} }` : 'null';
  const constPropsText = constEntries.length > 0 ? `{ ${constEntries.join(', ')} }` : 'null';
  const hasVarProps = varEntries.length > 0;
  let flags = computeJsxFlags(hasVarProps, childrenType, false, hasVarEventHandler);
  if (qpParams.length > 0) flags |= 4;

  opts.neededImports.add('_jsxSorted');

  return `/*#__PURE__*/ _jsxSorted(${tag}, ${varPropsText}, ${constPropsText}, ${childrenSlot}, ${flags}, ${keyText})`;
}

/**
 * A const event-handler value: a bare QRL identifier (`q_<sym>`), whose
 * lexical captures (if any) are delivered out-of-band via the element's
 * `q:p`/`q:ps` prop. SWC places these in the const props bag with the
 * `static_listeners` flag set.
 *
 * A `q_<sym>.w([captures])` handler is NOT const — the `.w()` binds the
 * captures inline, so the QRL reference varies with them. SWC keeps those
 * in the VAR bag and clears the `static_listeners` bit (see the
 * `example_parsed_inlined_qrls` snapshot, flags `2`). An inline arrow or
 * any other expression is likewise a var handler.
 */
function isConstEventHandlerValue(value: AstNode): boolean {
  return value.type === 'Identifier';
}

/** Extract a static key name from an object property. Returns null for
 * computed-key properties that don't have a constant string/identifier name. */
function propertyKeyName(prop: AstNode): string | null {
  if (prop.type !== 'Property' || !prop.key) return null;
  const key = prop.key;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return null;
}

/** Classify a children expression as static. Extends to MemberExpressions
 * on reactive bindings (which become `_wrapProp(...)` — compile-time-
 * resolved signal access) and arrays whose elements are all themselves
 * static. Nested `_jsxSorted(...)` calls (the rewritten form of inner
 * jsx() calls) classify as dynamic. The reactive-binding check is done
 * against the SOURCE AST (pre-wrap) since `isStaticChildren` runs before
 * the source-string `_wrapProp` overwrite via `buildJsxSortedCall`. */
function isStaticChildren(value: AstNode, reactive: ReadonlySet<string>): boolean {
  if (value.type === 'Literal') return true;
  if (value.type === 'TemplateLiteral' && (value.expressions ?? []).length === 0) return true;
  if (
    value.type === 'CallExpression' &&
    value.callee?.type === 'Identifier' &&
    value.callee.name === '_wrapProp'
  ) return true;
  if (
    value.type === 'MemberExpression' &&
    value.object?.type === 'Identifier' &&
    reactive.has(value.object.name)
  ) {
    // A reactive member read (signal `.value` or store `.field`) becomes a
    // stable `_wrapProp(...)` reference, so it counts as static children.
    const propName = staticPropName(value);
    if (propName !== null) return true;
  }
  if (value.type === 'ArrayExpression') {
    return (value.elements ?? []).every((el) => el != null && isStaticChildren(el, reactive));
  }
  return false;
}
