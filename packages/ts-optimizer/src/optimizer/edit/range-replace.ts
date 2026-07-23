/**
 * One AST walk that dispatches every node to every registered collector and gathers their range
 * replacements. Collectors must emit disjoint ranges — the orchestrator does not check for overlap.
 * A collector returning `skipSubtree: true` suppresses recursion into that node's children for all
 * collectors (used when replacing an entire subtree, e.g. folding `1 + 2 + 3` to `6`, where
 * recursing would emit overlapping inner ranges).
 */

import type { AstMaybeNode, AstNode, AstParentNode } from '../../ast-types.js';
import { forEachAstChild } from '../ast/guards.js';

export interface RangeReplacement {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/**
 * Context threaded to each collector at every visited node. `exprStart` is the source-absolute
 * offset of `exprText[0]`; replacement ranges index into `exprText`.
 */
export interface CollectorContext {
  readonly parentKey?: string;
  readonly parentNode?: AstParentNode;
  readonly exprStart: number;
  readonly exprText: string;
}

/**
 * Result returned by a collector for a single node. `skipSubtree: true` suppresses recursion into
 * this node's children for all collectors — use it when replacing an entire subtree (e.g.
 * simplifying `1 + 2 + 3` to `6`).
 */
export interface CollectorResult {
  readonly replacements: readonly RangeReplacement[];
  readonly skipSubtree?: boolean;
}

/** Per-node visitor. Return `null` for "not interested, recurse normally". */
export type RangeReplacementCollector = (
  node: AstNode,
  ctx: CollectorContext
) => CollectorResult | null;

/** Apply a list of disjoint range replacements to a source string. */
export function applyReplacements(
  text: string,
  replacements: ReadonlyArray<RangeReplacement>
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

export function collectRangeReplacements(
  root: AstMaybeNode,
  exprStart: number,
  exprText: string,
  collectors: readonly RangeReplacementCollector[]
): RangeReplacement[] {
  const out: RangeReplacement[] = [];
  if (collectors.length === 0) return out;

  function walk(
    node: AstMaybeNode,
    parentKey: string | undefined,
    parentNode: AstParentNode | undefined
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
   * How to treat MemberExpression `property` positions. `'nonComputed'` (default) excludes `.foo`
   * but allows `[foo]`; `'all'` excludes both.
   */
  memberPropertyMode?: 'all' | 'nonComputed';
}

/**
 * Whether an Identifier at this position is a _reference_ worth substituting — `false` for
 * declarator names, property keys, member-access properties (per `memberPropertyMode`), and
 * function parameters.
 *
 * Shorthand `Property` value positions return `true` here (not excluded); they need special-case
 * emit and the caller detects them via `parentKey === 'value' && parentNode.shorthand === true`.
 */
export function isReplaceableIdentifierPosition(
  parentKey: string | undefined,
  parentNode: AstParentNode | undefined,
  options: ReplaceableIdentifierPositionOptions = {}
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
 * Whether a `??` expression at this position needs wrapping parens. Returns `true` for parents with
 * precedence ≥ `??`; `LogicalExpression` is included because mixing `??` with `||`/`&&` is a syntax
 * error without explicit parens.
 */
export function expressionNeedsParens(
  parentKey: string | undefined,
  parentNode: AstParentNode | undefined
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
