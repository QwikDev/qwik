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
      const v = (node as { value?: unknown; bigint?: unknown }).value;
      const bigint = (node as { bigint?: unknown }).bigint;
      if (bigint !== undefined) return UNSIMPLIFIED;
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
      const u = node as { operator: string; argument: AstMaybeNode };
      const arg = simplifyExpression(u.argument);
      if (!arg.simplified) return UNSIMPLIFIED;
      const v = arg.value;
      switch (u.operator) {
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
      const b = node as { operator: string; left: AstMaybeNode; right: AstMaybeNode };
      const left = simplifyExpression(b.left);
      if (!left.simplified) return UNSIMPLIFIED;
      const right = simplifyExpression(b.right);
      if (!right.simplified) return UNSIMPLIFIED;
      const l = left.value as never;
      const r = right.value as never;
      switch (b.operator) {
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
      const lg = node as { operator: string; left: AstMaybeNode; right: AstMaybeNode };
      const left = simplifyExpression(lg.left);
      if (!left.simplified) return UNSIMPLIFIED;
      const l = left.value;
      switch (lg.operator) {
        case '&&': return l ? simplifyExpression(lg.right) : left;
        case '||': return l ? left : simplifyExpression(lg.right);
        case '??': return l === null || l === undefined ? simplifyExpression(lg.right) : left;
      }
      return UNSIMPLIFIED;
    }

    case 'ConditionalExpression': {
      const c = node as { test: AstMaybeNode; consequent: AstMaybeNode; alternate: AstMaybeNode };
      const t = simplifyExpression(c.test);
      if (!t.simplified) return UNSIMPLIFIED;
      return simplifyExpression(t.value ? c.consequent : c.alternate);
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
