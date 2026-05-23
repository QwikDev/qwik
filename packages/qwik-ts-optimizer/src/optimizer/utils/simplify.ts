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
import { createTransformSession } from './transform-session.js';
import {
  applyReplacements,
  collectRangeReplacements,
  type RangeReplacementCollector,
} from './range-replace.js';

// Re-export `applyReplacements` for the legacy import path (it lived in
// `simplify.ts` between OSS-415 and OSS-417; relocated to its natural
// home next to `collectRangeReplacements` in OSS-417). Consumers should
// import from `range-replace.js` directly going forward.
export { applyReplacements };

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

/**
 * Factory: returns a {@link RangeReplacementCollector} that emits a literal
 * replacement for any subtree {@link simplifyExpression} can fold to a
 * primitive value. Mirrors SWC's `simplify::simplifier` pass.
 *
 * The collector returns `skipSubtree: true` on matched nodes — children
 * are subsumed by the parent's emit, and recursing would emit overlapping
 * ranges into the now-replaced subtree.
 *
 * With `options.skipLiterals === true`, `Literal` nodes are ignored —
 * source-form literals (e.g. `"count"`) stay as-written instead of being
 * re-canonicalized to single quotes via {@link formatSimplifiedLiteral}.
 * The lambda-body caller in `signal-analysis.ts` leaves this `false`
 * because the quote canonicalization is desired there; the body-fold
 * pass in {@link foldBodySimplifiableExpressions} sets it `true`.
 */
export function simplificationsCollector(
  options: CollectSimplificationsOptions = {},
): RangeReplacementCollector {
  return (node, ctx) => {
    if (options.skipLiterals && node.type === 'Literal') return null;
    if (typeof node.start !== 'number' || typeof node.end !== 'number') return null;

    const result = simplifyExpression(node);
    if (!result.simplified) return null;

    const formatted = formatSimplifiedLiteral(result.value);
    const sliceStart = node.start - ctx.exprStart;
    const sliceEnd = node.end - ctx.exprStart;
    if (sliceStart < 0 || sliceEnd > ctx.exprText.length) {
      // Out-of-bounds — skip but still suppress recursion so children
      // don't fire either (would be misaligned by the same offset).
      return { replacements: [], skipSubtree: true };
    }
    const originalText = ctx.exprText.slice(sliceStart, sliceEnd);
    const replacements = formatted === originalText
      ? []  // no-op: source already has the canonical form
      : [{ start: sliceStart, end: sliceEnd, replacement: formatted }];
    return { replacements, skipSubtree: true };
  };
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

  // `skipLiterals: true` suppresses re-canonicalization of source literals
  // (e.g. `"count"` → `'count'`) — the body pass only folds *computed*
  // subtrees (Binary/Unary/Logical/Conditional with primitive-literal
  // operands) INTO literals; source-form literals stay as-written.
  const simplifications = collectRangeReplacements(
    session.program,
    0,
    session.wrappedSource,
    [simplificationsCollector({ skipLiterals: true })],
  );
  if (simplifications.length === 0) return bodyText;

  const folded = applyReplacements(session.wrappedSource, simplifications);
  return folded.slice(session.wrapperPrefix.length);
}
