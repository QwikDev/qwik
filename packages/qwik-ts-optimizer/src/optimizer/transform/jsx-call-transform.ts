/**
 * Transform `jsx(Tag, propsObj)` / `jsxs(...)` / `jsxDEV(...)` CallExpressions
 * into `_jsxSorted(tag, varProps, constProps, children, flags, key)` form.
 *
 * Mirrors SWC's `handle_jsx` (see `swc-reference-only/transform.rs:1163`).
 * The peer-tool input pattern this is for: `qwik-react`'s codegen emits
 * `jsx(...)` calls directly (pre-processed from JSX syntax) instead of leaving
 * JSX for the optimizer to rewrite. Those calls must still land as
 * `_jsxSorted(...)` in the optimized output. Convergence-test target:
 * `example_qwik_react`.
 *
 * Scope is intentionally narrow — handles the patterns that appear in the
 * qwik_react fixture:
 *   - `jsx(Tag, propsObj)` — 2-arg form, optional `children` property inside
 *     propsObj, every other prop classified as var (no const-folding).
 *   - `jsx(Tag, propsObj, keyArg)` — 3-arg form with explicit key.
 *
 * Skipped (matches SWC at `transform.rs:1166-1168`):
 *   - propsObj that isn't an ObjectExpression literal (e.g. `jsx(Tag, props)`
 *     where props is an Identifier — the optimizer leaves the call alone since
 *     it can't statically analyse the prop bag).
 *
 * Not handled here (future work if needed by other peer tools):
 *   - Spread props inside propsObj.
 *   - `bind:*` handling (no fixture exercises this in `jsx()` form).
 *   - Signal analysis on prop values (varProps are passed through verbatim).
 */

import type MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';
import {
  computeJsxFlags,
  type JsxKeyCounter,
} from './jsx.js';
import { transformEventPropName } from './event-handlers.js';
import { buildCaptureProp } from '../loop-hoisting.js';
import { forEachAstChild } from '../utils/ast.js';
import type { SegmentImportData } from '../segment-codegen.js';

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
}

/**
 * Walk a parsed program (typically a segment body wrapped in `(...)` to make
 * it parseable as an Expression) and rewrite every `jsx(Tag, propsObj, ...)`
 * call whose callee is in `jsxFunctions` into the `_jsxSorted(...)` form.
 *
 * Walk is bottom-up via `leave` — inner calls are rewritten before outer
 * calls, so when the outer's source text is sliced (for tag / children), it
 * contains the already-rewritten inner call text. Same pattern as
 * `transformAllJsx` uses for nested JSX.
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

  // SWC's `handle_jsx` only auto-keys the OUTERMOST jsx() call in a body;
  // nested calls (those that appear inside another jsx() call's argument
  // tree) get `null` as the key. Pre-walk top-down to mark every jsx()
  // call that's a descendant of another jsx() call.
  const nestedJsxStarts = new Set<number>();
  collectNestedJsxStarts(program, opts.jsxFunctions, nestedJsxStarts);

  // Collect reactive bindings (`const X = useStore(...)` / `useSignal(...)`
  // / `useComputed(...)` etc.) and rewrite `X.prop` accesses inside jsx()
  // call argument trees to `_wrapProp(X, "prop")`. SWC does this signal
  // analysis on JSX prop values + children. Limited to the immediate
  // jsx() call's argument tree — function bodies (arrow, inlinedQrl
  // callbacks) are separate scopes and aren't wrapped.
  const skipRanges = opts.skipRanges ?? [];
  const isInSkipRange = (start: number): boolean => {
    for (const r of skipRanges) {
      if (start >= r.start && start < r.end) return true;
    }
    return false;
  };

  const reactiveBindings = collectReactiveBindings(program);
  if (reactiveBindings.size > 0) {
    wrapReactiveAccessesInJsxCalls(
      s,
      program,
      opts.jsxFunctions,
      reactiveBindings,
      opts.neededImports,
      isInSkipRange,
    );
  }
  opts.reactiveBindings = reactiveBindings;

  walk(program, {
    leave(node: AstNode) {
      // Bail unless this is a `<jsxFunction>(tag, propsObjLiteral, ...)`
      // call. Per SWC `transform.rs:1166-1168`, non-ObjectExpression props
      // (e.g. a passed-through variable) leave the call unchanged.
      if (
        node.type !== 'CallExpression' ||
        node.callee?.type !== 'Identifier' ||
        !opts.jsxFunctions.has(node.callee.name) ||
        !node.arguments ||
        node.arguments.length < 2 ||
        node.arguments[1]?.type !== 'ObjectExpression'
      ) return;

      // Skip ranges occupied by another transform (e.g. parent rewrite
      // for $() / inlinedQrl arguments — segment-side codegen handles
      // those jsx() calls separately).
      if (isInSkipRange(node.start)) return;

      const isNested = nestedJsxStarts.has(node.start);
      const rewritten = buildJsxSortedCall(s, node, opts, isNested);
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

/**
 * For each jsx() call, walk its propsObj (the 2nd arg) and rewrite every
 * MemberExpression `reactiveObj.prop` that appears at a non-nested-function
 * position into `_wrapProp(reactiveObj, "prop")`. Top-down so outer jsx()
 * calls process first; we skip recursing into:
 *
 *   - nested jsx() calls (they'll be visited by their own `enter`)
 *   - function/arrow expressions (separate scope; the callback body is its
 *     own JSX/QRL context)
 *   - `inlinedQrl(...)` peer-tool calls (also a quasi-function expression
 *     whose body has its own lexical scope via `useLexicalScope()`)
 *
 * The MagicString overwrites are safe because the AST positions are read-
 * only once per node visit and we don't recurse into rewritten ranges.
 */
function wrapReactiveAccessesInJsxCalls(
  s: MagicString,
  program: AstProgram,
  jsxFunctions: ReadonlySet<string>,
  reactiveBindings: ReadonlySet<string>,
  neededImports: Set<string>,
  isInSkipRange: (start: number) => boolean = () => false,
): void {
  walk(program, {
    enter(node: AstNode) {
      if (!isJsxCall(node, jsxFunctions)) return;
      // `isJsxCall` already narrowed: this is a CallExpression with
      // arguments.length >= 2 and arguments[1] an ObjectExpression.
      if (node.type !== 'CallExpression') return;
      // Skip calls inside another transform's range — same gate as the
      // main `_jsxSorted` rewrite below.
      if (isInSkipRange(node.start)) return;
      const propsArg = node.arguments?.[1];
      if (!propsArg || propsArg.type !== 'ObjectExpression') return;
      walkAndWrap(propsArg, s, jsxFunctions, reactiveBindings, neededImports);
    },
  });
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

function walkAndWrap(
  node: AstNode | null | undefined,
  s: MagicString,
  jsxFunctions: ReadonlySet<string>,
  reactiveBindings: ReadonlySet<string>,
  neededImports: Set<string>,
): void {
  if (!node) return;
  // Stop at scope/JSX boundaries — these are not part of the current jsx()
  // call's "JSX context"; signal wrapping doesn't apply inside them.
  if (isJsxCall(node, jsxFunctions)) return;
  if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return;
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === 'inlinedQrl'
  ) return;

  if (
    node.type === 'MemberExpression' &&
    node.object?.type === 'Identifier' &&
    reactiveBindings.has(node.object.name)
  ) {
    const propName = staticPropName(node);
    if (propName !== null) {
      const objText = s.slice(node.object.start, node.object.end);
      // Signal `.value` reads wrap to the one-arg form `_wrapProp(sig)`;
      // store field reads (`store.count`) wrap to `_wrapProp(store, "count")`.
      // Both yield a stable reactive reference the runtime resolves per render.
      const replacement = propName === 'value'
        ? `_wrapProp(${objText})`
        : `_wrapProp(${objText}, "${propName}")`;
      s.overwrite(node.start, node.end, replacement);
      neededImports.add('_wrapProp');
      return;
    }
  }

  forEachAstChild(node, (child) => walkAndWrap(child as AstNode, s, jsxFunctions, reactiveBindings, neededImports));
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
 * Walk the program top-down and add every jsx() call whose NEAREST jsx()
 * ancestor is an HTML-tag call (string-literal tag arg) to `out`. SWC's
 * behaviour: nested calls under HTML parents take `null` for the key arg
 * (only the outermost call keys); nested calls under COMPONENT parents
 * (identifier tag arg) keep auto-keys all the way down.
 *
 */
function collectNestedJsxStarts(
  program: AstProgram,
  jsxFunctions: ReadonlySet<string>,
  out: Set<number>,
): void {
  // Stack of "tag kinds" — most-recent first. Each entry is `'html'` for a
  // string-literal-tag jsx() call, `'component'` for an identifier-tag call.
  // Used to look up the nearest jsx() ancestor's tag kind when deciding
  // whether the current call is "nested under HTML".
  const tagStack: ('html' | 'component')[] = [];
  walk(program, {
    enter(node: AstNode) {
      if (
        node.type !== 'CallExpression' ||
        node.callee?.type !== 'Identifier' ||
        !jsxFunctions.has(node.callee.name) ||
        !node.arguments ||
        node.arguments.length < 2 ||
        node.arguments[1]?.type !== 'ObjectExpression'
      ) return;
      if (tagStack.length > 0 && tagStack[tagStack.length - 1] === 'html') {
        out.add(node.start);
      }
      const tagArg = node.arguments[0];
      const kind: 'html' | 'component' =
        tagArg && tagArg.type === 'Literal' && typeof tagArg.value === 'string'
          ? 'html'
          : 'component';
      tagStack.push(kind);
    },
    leave(node: AstNode) {
      if (
        node.type !== 'CallExpression' ||
        node.callee?.type !== 'Identifier' ||
        !jsxFunctions.has(node.callee.name) ||
        !node.arguments ||
        node.arguments.length < 2 ||
        node.arguments[1]?.type !== 'ObjectExpression'
      ) return;
      tagStack.pop();
    },
  });
}

/**
 * Build the `_jsxSorted(tag, varProps, null, children, flags, key)` string
 * for one `jsx(Tag, propsObj, ...)` call. Returns null if the call can't be
 * rewritten (caller leaves it alone).
 */
function buildJsxSortedCall(
  s: MagicString,
  callNode: AstNode,
  opts: JsxCallTransformOptions,
  isNested: boolean,
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

  // Partition props into `children` (positional 4th arg) and everything else
  // (varProps bag). SpreadElement entries are preserved inline in source
  // order — compareAst's `mergeJsxSplitProps` + `mergeGetVarConstProps`
  // collapse SWC's `_jsxSplit(tag, {..._getVarProps(rest), ...}, _getConstProps(rest), ...)`
  // into the same shape as `_jsxSorted(tag, {...rest, ...}, null, ...)`, so
  // we emit the single-bag form regardless. Anything other than
  // Property/SpreadElement (e.g. a setter) is out of scope — leave the call
  // unchanged.
  let childrenText: string | null = null;
  let childrenIsDynamic = false;
  let hasVarEventHandler = false;
  const varEntries: string[] = [];
  const constEntries: string[] = [];
  // Union of `q:p`/`q:ps` capture params across all const event handlers on
  // this element (an element with two capturing handlers shares one prop).
  const qpParams: string[] = [];
  for (const prop of propsArg.properties) {
    if (prop.type === 'SpreadElement') {
      varEntries.push(s.slice(prop.start, prop.end));
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
        if (isConstEventHandlerValue(prop.value)) {
          constEntries.push(`"${transformed}": ${valueText}`);
          // A const handler delivers its captures positionally; record them
          // so the element emits one `q:p`/`q:ps` prop below.
          const handlerQp = opts.qpByQrl?.get(valueText);
          if (handlerQp) {
            for (const p of handlerQp) {
              if (!qpParams.includes(p)) qpParams.push(p);
            }
          }
        } else {
          varEntries.push(`"${transformed}": ${valueText}`);
          hasVarEventHandler = true;
        }
        continue;
      }
    }
    varEntries.push(s.slice(prop.start, prop.end));
  }

  // Optional 3rd arg: explicit key. Maps to the 6th `_jsxSorted` arg.
  // Fall back to an auto-generated key per `JsxKeyCounter` — but only for
  // OUTERMOST calls. Nested jsx() calls (those inside another jsx() call's
  // argument tree) get `null` per SWC's `handle_jsx`.
  let keyText: string;
  if (args.length >= 3 && args[2] && args[2].type !== 'SpreadElement') {
    const keyArg = args[2];
    keyText = s.slice(keyArg.start, keyArg.end);
  } else if (isNested) {
    keyText = 'null';
  } else {
    keyText = `"${opts.keyCounter.next()}"`;
  }

  // The element's `q:p`/`q:ps` capture prop goes in the VAR bag (the captured
  // values can change between renders), ahead of any other var props —
  // matching SWC's emit order. Its presence sets the `moved_captures` flag.
  if (qpParams.length > 0) {
    const qp = buildCaptureProp(qpParams, true);
    if (qp) varEntries.unshift(`"${qp.propName}": ${qp.propValue}`);
  }

  const varPropsText = varEntries.length > 0 ? `{ ${varEntries.join(', ')} }` : 'null';
  const constPropsText = constEntries.length > 0 ? `{ ${constEntries.join(', ')} }` : 'null';
  const childrenSlot = childrenText ?? 'null';
  const childrenType: 'none' | 'static' | 'dynamic' = childrenText === null
    ? 'none'
    : childrenIsDynamic ? 'dynamic' : 'static';
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
