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
  const result = new Set<string>();
  for (const imp of importContext.moduleImports) {
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

      const rewritten = buildJsxSortedCall(s, node, opts);
      if (rewritten !== null) {
        s.overwrite(node.start, node.end, rewritten);
      }
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

  // Partition props into `children` (positional 4th arg) and everything else
  // (varProps bag). Anything that isn't a plain `Property` (e.g. spread
  // inside the props object) is out of scope — leave the whole call
  // unchanged.
  let childrenText: string | null = null;
  let childrenIsDynamic = false;
  const varEntries: string[] = [];
  for (const prop of propsArg.properties) {
    if (prop.type !== 'Property') return null;
    const keyName = propertyKeyName(prop);
    if (keyName === 'children' && !prop.computed) {
      const value = prop.value;
      childrenText = s.slice(value.start, value.end);
      childrenIsDynamic = !isStaticChildren(value);
      continue;
    }
    varEntries.push(s.slice(prop.start, prop.end));
  }

  // Optional 3rd arg: explicit key. Maps to the 6th `_jsxSorted` arg.
  // Fall back to an auto-generated key per `JsxKeyCounter`.
  let keyText: string;
  if (args.length >= 3 && args[2] && args[2].type !== 'SpreadElement') {
    const keyArg = args[2];
    keyText = s.slice(keyArg.start, keyArg.end);
  } else {
    keyText = `"${opts.keyCounter.next()}"`;
  }

  const varPropsText = varEntries.length > 0 ? `{ ${varEntries.join(', ')} }` : 'null';
  const constPropsText = 'null';
  const childrenSlot = childrenText ?? 'null';
  const childrenType: 'none' | 'static' | 'dynamic' = childrenText === null
    ? 'none'
    : childrenIsDynamic ? 'dynamic' : 'static';
  const hasVarProps = varEntries.length > 0;
  const flags = computeJsxFlags(hasVarProps, childrenType);

  opts.neededImports.add('_jsxSorted');

  return `/*#__PURE__*/ _jsxSorted(${tag}, ${varPropsText}, ${constPropsText}, ${childrenSlot}, ${flags}, ${keyText})`;
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

/** Classify a children expression as static. Conservative: any non-trivial
 * expression is dynamic. */
function isStaticChildren(value: AstNode): boolean {
  return (
    value.type === 'Literal' ||
    (value.type === 'TemplateLiteral' && (value.expressions ?? []).length === 0)
  );
}
