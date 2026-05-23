/**
 * Expression simplifier for JSX prop values.
 *
 * Named after — and matching the intent of — SWC's `simplify::simplifier`
 * pass that the Qwik Rust optimizer explicitly invokes after its main
 * transform (see `swc-reference-only/parse.rs:360`). The SWC simplifier
 * evaluates compile-time-constant subtrees and rewrites them as
 * literals, shrinking emitted code. This module ports the slice of
 * that behaviour relevant to JSX prop emission: trivial binary / unary
 * / logical / conditional expressions where the operands are primitive
 * literals.
 *
 * Without this, `prop={'true' + 1 ? 'true' : ''}` emits as
 * `prop: "true" + 1 ? "true" : ""` instead of `prop: 'true'`.
 *
 * Post-order traversal so nested subtrees collapse from the leaves up;
 * `('true' + 1) ? a : b` first simplifies the binary to a string
 * literal, then the conditional sees a literal test and picks the
 * consequent branch.
 *
 * Conservative — only simplifies primitive literal operands (string /
 * number / boolean / null / undefined). BigInt, divide-by-zero, and
 * other exotic coercions are left untouched.
 */
import type { AstMaybeNode } from '../../ast-types.js';
import { forEachAstChild } from './ast.js';
import { createTransformSession } from './transform-session.js';

/**
 * Try to simplify the given expression to a JS primitive value at
 * compile time. Returns `{ simplified: true, value }` if the entire
 * subtree collapses to a primitive literal, otherwise
 * `{ simplified: false }`.
 */
export function simplifyExpression(node: AstMaybeNode): SimplifyResult {
  if (!node) return UNSIMPLIFIED;
  switch (node.type) {
    case 'Literal': {
      // After narrowing, `node` is `BooleanLiteral | NullLiteral |
      // NumericLiteral | StringLiteral | BigIntLiteral | RegExpLiteral`.
      // The typeof guards below admit only the four primitive-valued
      // variants (Boolean/Null/Numeric/String) — BigIntLiteral's
      // `bigint`-typed value and RegExpLiteral's `object`-typed value
      // both fall through to UNSIMPLIFIED. The old explicit `.bigint`
      // check is therefore redundant.
      const v = node.value;
      if (
        v === null ||
        v === undefined ||
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        return { simplified: true, value: v };
      }
      return UNSIMPLIFIED;
    }

    case 'UnaryExpression': {
      const arg = simplifyExpression(node.argument);
      if (!arg.simplified) return UNSIMPLIFIED;
      const v = arg.value;
      switch (node.operator) {
        case '!': return { simplified: true, value: !v };
        case 'typeof': return { simplified: true, value: typeof v };
        case 'void': return { simplified: true, value: undefined };
        case '-': return typeof v === 'number' ? { simplified: true, value: -v } : UNSIMPLIFIED;
        case '+': return typeof v === 'number' ? { simplified: true, value: +v } : UNSIMPLIFIED;
        case '~': return typeof v === 'number' ? { simplified: true, value: ~v } : UNSIMPLIFIED;
      }
      return UNSIMPLIFIED;
    }

    case 'BinaryExpression': {
      const left = simplifyExpression(node.left);
      if (!left.simplified) return UNSIMPLIFIED;
      const right = simplifyExpression(node.right);
      if (!right.simplified) return UNSIMPLIFIED;
      // `as never` casts here are load-bearing — TypeScript correctly
      // refuses `string + boolean` etc., but matching SWC's simplifier
      // means doing the JS-side arithmetic that does allow it. The
      // casts bridge the TS-vs-JS arithmetic gap; the value remains
      // typed to the SimplifyResult union via the typeof guards on
      // each non-`+` branch.
      const l = left.value as never;
      const r = right.value as never;
      switch (node.operator) {
        case '+': return { simplified: true, value: (l as never) + (r as never) };
        case '-': return typeof l === 'number' && typeof r === 'number' ? { simplified: true, value: l - r } : UNSIMPLIFIED;
        case '*': return typeof l === 'number' && typeof r === 'number' ? { simplified: true, value: l * r } : UNSIMPLIFIED;
        case '/': return typeof l === 'number' && typeof r === 'number' && r !== 0 ? { simplified: true, value: l / r } : UNSIMPLIFIED;
        case '%': return typeof l === 'number' && typeof r === 'number' && r !== 0 ? { simplified: true, value: l % r } : UNSIMPLIFIED;
        case '===': return { simplified: true, value: l === r };
        case '!==': return { simplified: true, value: l !== r };
        // eslint-disable-next-line eqeqeq
        case '==': return { simplified: true, value: l == r };
        // eslint-disable-next-line eqeqeq
        case '!=': return { simplified: true, value: l != r };
        case '<': return { simplified: true, value: l < r };
        case '>': return { simplified: true, value: l > r };
        case '<=': return { simplified: true, value: l <= r };
        case '>=': return { simplified: true, value: l >= r };
      }
      return UNSIMPLIFIED;
    }

    case 'LogicalExpression': {
      const left = simplifyExpression(node.left);
      if (!left.simplified) return UNSIMPLIFIED;
      const l = left.value;
      switch (node.operator) {
        case '&&': return l ? simplifyExpression(node.right) : left;
        case '||': return l ? left : simplifyExpression(node.right);
        case '??': return l === null || l === undefined ? simplifyExpression(node.right) : left;
      }
      return UNSIMPLIFIED;
    }

    case 'ConditionalExpression': {
      const t = simplifyExpression(node.test);
      if (!t.simplified) return UNSIMPLIFIED;
      return simplifyExpression(t.value ? node.consequent : node.alternate);
    }
  }
  return UNSIMPLIFIED;
}

/**
 * Format a simplified primitive value as a JS source string suitable for
 * splicing into emitted code. Strings use single quotes to match SWC's
 * preferred output style; other primitives use their canonical form.
 */
export function formatSimplifiedLiteral(value: unknown): string {
  if (typeof value === 'string') {
    // Single-quoted with minimal escaping. Embedded single quotes get
    // escaped; embedded double quotes are left alone so the output
    // matches SWC's emit style (`prop: 'has "quotes"'`).
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
  }
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    return String(value);
  }
  // boolean
  return String(value);
}

export type SimplifyResult =
  | { simplified: true; value: string | number | boolean | null | undefined }
  | { simplified: false };

const UNSIMPLIFIED: SimplifyResult = { simplified: false };

/** Apply a list of disjoint range replacements to a source string. */
export function applyReplacements(
  text: string,
  replacements: ReadonlyArray<{ start: number; end: number; replacement: string }>,
): string {
  if (replacements.length === 0) return text;
  const sorted = [...replacements].sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const r of sorted) {
    out += text.slice(pos, r.start);
    out += r.replacement;
    pos = r.end;
  }
  out += text.slice(pos);
  return out;
}

/**
 * Walk an expression subtree top-down looking for subtrees that
 * {@link simplifyExpression} can collapse to a primitive literal. Emits a
 * replacement (range → `formatSimplifiedLiteral(value)`) per matching
 * subtree and **does not recurse into simplified subtrees** — the children
 * are already represented by the parent's emit.
 *
 * Skips no-op replacements where the formatted literal equals the source
 * text verbatim (e.g. source already says `3`).
 *
 * `exprStart` is the source-absolute offset of `exprText[0]`; matched
 * ranges are emitted relative to `exprText`.
 */
export interface CollectSimplificationsOptions {
  /**
   * When `true`, skip `Literal` nodes — they're already in their canonical
   * source form and re-formatting via {@link formatSimplifiedLiteral} would
   * just re-canonicalize the quote style (e.g. `"x"` → `'x'`). The
   * body-fold pass uses this; the lambda-body folder in `signal-analysis.ts`
   * (the original caller) leaves it `false` because it relies on the
   * quote canonicalization for matching SWC's lambda-body emit.
   */
  skipLiterals?: boolean;
}

export function collectSimplifications(
  n: AstMaybeNode,
  exprStart: number,
  exprText: string,
  out: Array<{ start: number; end: number; replacement: string }>,
  options: CollectSimplificationsOptions = {},
): void {
  if (!n || typeof n !== 'object') return;
  if (typeof n.start !== 'number' || typeof n.end !== 'number') {
    forEachAstChild(n, (child) =>
      collectSimplifications(child, exprStart, exprText, out, options));
    return;
  }

  if (!options.skipLiterals || n.type !== 'Literal') {
    const result = simplifyExpression(n);
    if (result.simplified) {
      const formatted = formatSimplifiedLiteral(result.value);
      const sliceStart = n.start - exprStart;
      const sliceEnd = n.end - exprStart;
      if (sliceStart >= 0 && sliceEnd <= exprText.length) {
        const originalText = exprText.slice(sliceStart, sliceEnd);
        if (formatted !== originalText) {
          out.push({ start: sliceStart, end: sliceEnd, replacement: formatted });
        }
      }
      // Do NOT recurse — the simplified value already represents the whole
      // subtree, and recursing would emit overlapping ranges.
      return;
    }
  }

  forEachAstChild(n, (child) =>
    collectSimplifications(child, exprStart, exprText, out, options));
}

/**
 * OSS-415: fold constant-foldable subtrees inside a segment-body source.
 *
 * Runs as a post-JSX-transform pass over the body text. By that timing,
 * JSX-prop positions have become `_fnSignal(...)` calls (with `_hf<n>_str`
 * already generated source-preserving), so any remaining `?? <const-expr>`
 * patterns live in non-JSX positions like `console.log(_rawProps.X ?? 1+2)`.
 *
 * Mirrors SWC's `simplify::simplifier` pass that the Qwik Rust optimizer
 * runs after its main transform (`swc-reference-only/parse.rs:360`).
 * Strictly narrower than the full SWC simplifier — only folds subtrees that
 * `simplifyExpression` can collapse to a primitive literal, matching the
 * same conservative gate the lambda-body folder in `signal-analysis.ts`
 * already uses.
 *
 * Wraps the body in `const __body__ = …` so a bare arrow expression
 * parses; returns the body source unchanged on parse failure (defensive,
 * the body has already been through several earlier transforms).
 */
export function foldBodySimplifiableExpressions(bodyText: string): string {
  if (bodyText.length === 0) return bodyText;
  const session = createTransformSession('__fold__.tsx', bodyText, {
    wrapperPrefix: 'const __body__ = ',
  });
  if (!session) return bodyText;

  const simplifications: Array<{ start: number; end: number; replacement: string }> = [];
  // exprText spans the wrapped source; replacements come out relative to it,
  // then we slice off the wrapper prefix at the end. `skipLiterals: true`
  // suppresses re-canonicalization of source literals (e.g. `"count"` →
  // `'count'`) — the body pass only wants to fold *computed* subtrees
  // (Binary/Unary/Logical/Conditional with primitive-literal operands)
  // INTO literals; source-form literals stay as-written.
  collectSimplifications(
    session.program,
    0,
    session.wrappedSource,
    simplifications,
    { skipLiterals: true },
  );
  if (simplifications.length === 0) return bodyText;

  const folded = applyReplacements(session.wrappedSource, simplifications);
  return folded.slice(session.wrapperPrefix.length);
}
