/**
 * Range-replacement walker primitive.
 *
 * Consolidates walk-and-collect passes that each independently walk an
 * AST top-down, test a predicate, push `{start, end, replacement}`
 * records, and apply them disjointly. The known callers:
 *
 * | Pass | Predicate |
 * |---|---|
 * | `signal-analysis.ts:collectReplacements` | root identifier → `pN` (skip property-key / member-prop) |
 * | `utils/simplify.ts:collectSimplifications` | foldable subtree → primitive literal |
 * | `signal-analysis.ts:collectParenStrips` | `ParenthesizedExpression` with `Property` value parent → strip parens |
 * | `rewrite/raw-props.ts:collectIdentifierReplacements` | identifier matching `fieldLocalToKey` → `_rawProps.X` |
 * | `utils/props-field-rewrite.ts:walkNode` | same as raw-props (near-duplicate) |
 *
 * The Identifier-position guard (skip property-key / member-prop / param /
 * declarator-id) appears in 3 of the walkers; it's extracted here as
 * {@link isReplaceableIdentifierPosition}.
 *
 * ## API shape
 *
 * Each pass becomes a `RangeReplacementCollector` — a per-node visitor that
 * returns 0+ replacements plus an optional `skipSubtree` signal. The
 * orchestrator runs ONE AST walk and dispatches every node to every
 * registered collector, then applies replacements via
 * {@link applyReplacements} (re-exported from `utils/simplify.ts`).
 *
 * ## skipSubtree semantics
 *
 * `collectSimplifications` and its body-fold sibling have the invariant
 * "don't recurse into a simplified subtree" — children would emit
 * overlapping ranges into the now-irrelevant subtree (e.g. `1 + 2 + 3`
 * folds to `6`; recursing would also fold the inner `1 + 2` to `3` and
 * emit `3 + 3` overlapping the outer `6`). When any collector returns
 * `skipSubtree: true`, the orchestrator skips recursion into THAT subtree
 * for ALL collectors — conservative; safe because the subtree is being
 * replaced wholesale.
 *
 * Other collectors (paren-strip, identifier-substitution) don't return
 * `skipSubtree`. Paren-strip emits boundary replacements but still
 * recurses (nested parens at different positions); identifier passes
 * match leaves so recursion past them is a no-op.
 *
 * ## Disjoint-range guarantee
 *
 * The orchestrator does NOT check for overlaps between collectors at
 * runtime — that's still the caller's responsibility. The current pass
 * set is disjoint by construction:
 *
 * - Root replacements target Identifiers
 * - Simplifications target Binary/Unary/Logical/Conditional with primitive operands
 * - Paren-strips target ParenthesizedExpression boundary edges
 *
 * No node-type overlap. See `signal-analysis.ts:generateFnSignal`
 * commentary for the original disjoint-by-construction reasoning.
 */

import type { AstMaybeNode, AstNode, AstParentNode } from '../../ast-types.js';
import { forEachAstChild } from '../ast/guards.js';

/** A range edit: [start, end) of `exprText` is replaced with `replacement`. */
export interface RangeReplacement {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/** Context threaded to each collector at every visited node. */
export interface CollectorContext {
  /** Property name on the parent that holds this node (e.g. `'value'`, `'left'`). */
  readonly parentKey?: string;
  /** Parent AST node. `undefined` at the root. */
  readonly parentNode?: AstParentNode;
  /** Source-absolute offset of `exprText[0]`. Subtract from `node.start` to get relative offset. */
  readonly exprStart: number;
  /** The source text being edited. Replacement ranges index into this. */
  readonly exprText: string;
}

/** Result returned by a collector for a single visited node. */
export interface CollectorResult {
  /** Replacements to emit for this node. Empty array = no emit. */
  readonly replacements: readonly RangeReplacement[];
  /**
   * If `true`, suppresses recursion into this node's children for ALL collectors.
   * Use when the collector is replacing the entire subtree with a different form
   * (e.g. simplifying `1 + 2 + 3` to `6`).
   */
  readonly skipSubtree?: boolean;
}

/** Per-node visitor. Return `null` for "not interested, recurse normally". */
export type RangeReplacementCollector = (
  node: AstNode,
  ctx: CollectorContext,
) => CollectorResult | null;

/** Apply a list of disjoint range replacements to a source string. */
export function applyReplacements(
  text: string,
  replacements: ReadonlyArray<RangeReplacement>,
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
 * Walk a subtree once, dispatching every node to every collector. Returns
 * a flat list of replacements suitable for {@link applyReplacements}.
 *
 * If any collector returns `skipSubtree: true` at a node, recursion into
 * that node's children is suppressed for ALL collectors.
 */
export function collectRangeReplacements(
  root: AstMaybeNode,
  exprStart: number,
  exprText: string,
  collectors: readonly RangeReplacementCollector[],
): RangeReplacement[] {
  const out: RangeReplacement[] = [];
  if (collectors.length === 0) return out;

  function walk(
    node: AstMaybeNode,
    parentKey: string | undefined,
    parentNode: AstParentNode | undefined,
  ): void {
    if (!node || typeof node !== 'object') return;
    const ctx: CollectorContext = { parentKey, parentNode, exprStart, exprText };

    let skipSubtree = false;
    for (const collect of collectors) {
      const result = collect(node, ctx);
      if (!result) continue;
      if (result.replacements.length > 0) out.push(...result.replacements);
      if (result.skipSubtree) skipSubtree = true;
    }

    if (skipSubtree) return;
    forEachAstChild(node, (child, key, parent) => walk(child, key, parent));
  }

  walk(root, undefined, undefined);
  return out;
}

export interface ReplaceableIdentifierPositionOptions {
  /**
   * How to treat MemberExpression `property` positions.
   * - `'nonComputed'` (default): exclude `.foo` (non-computed) but allow
   *   `[foo]` (computed). The historic raw-props + signal-analysis behaviour.
   * - `'all'`: exclude both `.foo` and `[foo]`. Used by the segment-codegen
   *   caller of `rewritePropsFieldReferences`.
   */
  memberPropertyMode?: 'all' | 'nonComputed';
}

/**
 * The standard "should this Identifier reference be replaced here?" predicate.
 * Returns `false` for positions where the Identifier is a declarator name,
 * a property key, a member access property (per `memberPropertyMode`), or
 * a function parameter — none of which represent a *reference* to the
 * binding that would benefit from substitution.
 *
 * Shared by:
 * - `signal-analysis.ts` root-identifier-to-`pN` replacement
 * - `rewrite/raw-props.ts` field-local-to-`_rawProps.X` replacement
 * - `utils/props-field-rewrite.ts` (callers under both `memberPropertyMode`s)
 *
 * **Shorthand `Property` value positions are NOT excluded by this check** —
 * those require special-case emit (key + ': ' + accessor) and the
 * caller handles them separately. This predicate returns `true` for the
 * shorthand value position so the caller can detect it via
 * `parentKey === 'value' && parentNode.shorthand === true`.
 */
export function isReplaceableIdentifierPosition(
  parentKey: string | undefined,
  parentNode: AstParentNode | undefined,
  options: ReplaceableIdentifierPositionOptions = {},
): boolean {
  if (parentKey === 'key' && parentNode?.type === 'Property') return false;
  if (parentKey === 'property' && parentNode?.type === 'MemberExpression') {
    if (options.memberPropertyMode === 'all') return false;
    if (!parentNode.computed) return false;
  }
  if (parentKey === 'params') return false;
  if (parentKey === 'id' && parentNode?.type === 'VariableDeclarator') return false;
  return true;
}

/**
 * Does a `??` LogicalExpression at this position need wrapping parens?
 * Drives precedence-aware emission in `raw-props.ts` and
 * `props-field-rewrite.ts`. Returns `true` only when the parent operator
 * has precedence ≥ `??` (Binary/Logical/Unary/Update/MemberExpression
 * object / TaggedTemplate tag / Call+New callee). Note that mixing `??`
 * with `||` or `&&` is a JS syntax error without explicit parens —
 * `LogicalExpression` includes that case.
 */
export function expressionNeedsParens(
  parentKey: string | undefined,
  parentNode: AstParentNode | undefined,
): boolean {
  if (!parentNode) return false;
  switch (parentNode.type) {
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'UnaryExpression':
    case 'UpdateExpression':
    case 'TaggedTemplateExpression':
      return true;
    case 'MemberExpression':
      return parentKey === 'object';
    case 'NewExpression':
    case 'CallExpression':
      return parentKey === 'callee';
    default:
      return false;
  }
}
