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
