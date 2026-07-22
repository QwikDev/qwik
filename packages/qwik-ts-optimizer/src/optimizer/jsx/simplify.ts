/**
 * Expression simplifier for JSX prop values: evaluates compile-time-constant
 * subtrees and rewrites them as literals to shrink emitted code, so
 * `prop={'true' + 1 ? 'true' : ''}` emits as `prop: 'true'`. Post-order so
 * nested subtrees collapse from the leaves up. Conservative — only primitive
 * literal operands (string/number/boolean/null/undefined); BigInt,
 * divide-by-zero, and other exotic coercions are left untouched.
 */
import type { AstMaybeNode } from '../../ast-types.js';
import { createTransformSession } from '../edit/transform-session.js';
import {
  applyReplacements,
  collectRangeReplacements,
  type RangeReplacementCollector,
} from '../edit/range-replace.js';

// Re-export `applyReplacements` for the legacy import path; the helper
// lives next to `collectRangeReplacements` in `range-replace.js` —
// consumers should import from there directly going forward.
export { applyReplacements };

export function simplifyExpression(node: AstMaybeNode): SimplifyResult {
  if (!node) return UNSIMPLIFIED;
  switch (node.type) {
    case 'Literal': {
      // The typeof guards admit only the four primitive-valued Literal variants;
      // BigInt (bigint value) and RegExp (object value) fall through to
      // UNSIMPLIFIED.
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
      // The `as never` casts are load-bearing: TS refuses `string + boolean`,
      // but JS-side folding must allow it. The casts bridge the TS-vs-JS
      // arithmetic gap; the result stays typed via the typeof guards on each
      // non-`+` branch.
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
 * Format a simplified primitive value as a JS source string for splicing into
 * emitted code. Strings use single quotes; other primitives use their canonical
 * form.
 */
export function formatSimplifiedLiteral(value: unknown): string {
  if (typeof value === 'string') {
    // Single-quoted with minimal escaping: embedded single quotes escaped,
    // double quotes left alone.
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
  return String(value);
}

export type SimplifyResult =
  | { simplified: true; value: string | number | boolean | null | undefined }
  | { simplified: false };

const UNSIMPLIFIED: SimplifyResult = { simplified: false };

/**
 * Shared implementation behind the two collector factories. `skipLiterals = true`
 * suppresses Literal matching so source-form literals stay as-written
 * (body-source emit) instead of being re-canonicalized to single-quoted form
 * (lambda-body emit wants canonical). Returns `skipSubtree: true` on every
 * match — children are subsumed by the parent's emit, and recursing would emit
 * overlapping ranges into the replaced subtree.
 */
function buildSimplificationsCollector(skipLiterals: boolean): RangeReplacementCollector {
  return (node, ctx) => {
    if (skipLiterals && node.type === 'Literal') return null;
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
 * Collector for the hoisted lambda body (`_hf<n>`) emit. Folds ANY simplifiable
 * subtree including `Literal` nodes (re-canonicalizes source quote style to
 * single-quoted form).
 */
export function lambdaBodySimplificationsCollector(): RangeReplacementCollector {
  return buildSimplificationsCollector(false);
}

/**
 * Collector for body-source emit — used by
 * {@link foldBodySimplifiableExpressions}. Folds only *computed*
 * subtrees (Binary/Unary/Logical/Conditional with primitive operands);
 * `Literal` nodes are left as-written so the user's source quote style
 * is preserved.
 */
export function bodySourceSimplificationsCollector(): RangeReplacementCollector {
  return buildSimplificationsCollector(true);
}

/**
 * Fold constant-foldable subtrees inside a segment-body source, as a
 * post-JSX-transform pass. By that timing JSX-prop positions are already
 * `_fnSignal(...)` calls, so remaining foldable patterns live in non-JSX
 * positions (`console.log(_rawProps.X ?? 1+2)`). Only folds subtrees
 * `simplifyExpression` can collapse to a primitive literal. Wraps the body in
 * `const __body__ = …` so a bare arrow parses; returns the body unchanged on
 * parse failure.
 */
export function foldBodySimplifiableExpressions(bodyText: string): string {
  if (bodyText.length === 0) return bodyText;
  const session = createTransformSession(bodyText);
  if (!session) return bodyText;

  const simplifications = collectRangeReplacements(
    session.program,
    0,
    session.wrappedSource,
    [bodySourceSimplificationsCollector()],
  );
  if (simplifications.length === 0) return bodyText;

  const folded = applyReplacements(session.wrappedSource, simplifications);
  return folded.slice(session.wrapperPrefix.length);
}
