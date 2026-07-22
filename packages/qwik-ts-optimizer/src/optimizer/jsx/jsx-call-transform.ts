import type MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';
import { someAstChild, memberStaticPropName } from '../ast/guards.js';
import {
  computeJsxFlags,
  collectScopeAwareBindings,
  isConstBindingName,
  fnSignalDepsAllConst,
  type ScopeAwareBindings,
  type JsxKeyCounter,
} from './jsx.js';
import { transformEventPropName } from './event-handlers.js';
import { buildCaptureProp } from './loop-hoisting.js';
import { analyzeSignalExpression, type SignalHoister } from './signal-analysis.js';
import type { SegmentImportData } from '../segment/segment-codegen.js';

const EMPTY_SET: ReadonlySet<string> = new Set();

export function collectJsxFunctionNames(importContext: SegmentImportData): Set<string> {
  return collectJsxFunctionNamesFromIterable(importContext.moduleImports);
}

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
  reactiveBindings?: ReadonlySet<string>;
  /** Byte ranges `[start, end)` to skip. Used by the parent-rewrite path so
   * `jsx()` calls already inside a marker extraction's argument tree (handled
   * by segment-codegen) aren't double-transformed. */
  skipRanges?: ReadonlyArray<{ readonly start: number; readonly end: number }>;
  /** Maps an event-handler QRL var (`q_<sym>`) to the lexical-capture params
   * delivered positionally. When a const handler on an element references one,
   * the element gets a `q:p`/`q:ps` prop so the runtime passes captures through. */
  qpByQrl?: ReadonlyMap<string, readonly string[]>;
  importedNames?: ReadonlySet<string>;
  signalHoister?: SignalHoister;
  localNames?: ReadonlySet<string>;
  bindings?: ScopeAwareBindings;
  paramNames?: readonly string[];
}

/**
 * Rewrite every `jsx(Tag, propsObj, ...)` whose callee is in `jsxFunctions`
 * to `_jsxSorted(...)`. Two passes: gather reactive bindings first (a
 * `const X = use*()` can appear after the first `jsx()` call in document order,
 * so the set must be complete before any wrap decision), then rewrite
 * bottom-up so an outer call's sliced source contains already-rewritten inner
 * calls. Mutates `s` and `opts.neededImports`.
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
    const depsAllConst = fnSignalDepsAllConst(
      sig.deps, importedNames, bindings, pos, isHtmlTag,
      (dep) => opts.paramNames?.includes(dep) ?? false,
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
  // The CallExpression check is required for type-checker narrowing before
  // destructuring, even though the caller already gated on it.
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
  // HTML tags are string-literal first args; component tags are identifiers.
  // Event-handler key rewriting (`onClick$` → `"q-e:click"`) applies only to
  // HTML — components receive the `*$` form as a JSX prop and wire it at runtime.
  const isHtmlTag = tagArg.type === 'Literal' && typeof tagArg.value === 'string';

  let childrenText: string | null = null;
  let childrenIsDynamic = false;
  let hasVarEventHandler = false;
  const varEntries: string[] = [];
  const constEntries: string[] = [];
  const slots: PropSlot[] = [];
  const spreadArgs: string[] = [];
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
    if (isHtmlTag && keyName !== null) {
      const transformed = transformEventPropName(keyName, new Set());
      if (transformed !== null) {
        const valueText = s.slice(prop.value.start, prop.value.end);
        // A const event handler (bare QRL ref `q_X`) belongs in the const props
        // bag with the static_listeners flag: put it in the var bag while the
        // flag claims static listeners and the runtime looks in the const bag,
        // finds nothing, and never wires the event. An inline arrow or computed
        // value is a var handler and drops the flag bit.
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

  // The element's `q:p`/`q:ps` capture prop goes in the VAR bag (captured
  // values can change between renders), ahead of other var props; its presence
  // sets the moved_captures flag.
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
 * A const event-handler value is a bare QRL identifier (`q_<sym>`); its captures
 * ride the element's `q:p`/`q:ps` prop. A `q_<sym>.w([captures])` handler is NOT
 * const — `.w()` binds captures inline so the reference varies with them (var
 * bag, static_listeners cleared).
 */
function isConstEventHandlerValue(value: AstNode): boolean {
  return value.type === 'Identifier';
}

function propertyKeyName(prop: AstNode): string | null {
  if (prop.type !== 'Property' || !prop.key) return null;
  const key = prop.key;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return null;
}

/** Classify a children expression as static. The reactive-binding check runs
 * against the SOURCE AST (pre-wrap), since `isStaticChildren` runs before the
 * `_wrapProp` overwrite in `buildJsxSortedCall`. */
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
    const propName = memberStaticPropName(value);
    if (propName !== null) return true;
  }
  if (value.type === 'ArrayExpression') {
    return (value.elements ?? []).every((el) => el != null && isStaticChildren(el, reactive));
  }
  return false;
}
