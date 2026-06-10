/**
 * Shared q:p collection walk.
 *
 * Both emit paths (segment-file codegen and the inline/hoist strategy) need
 * the same mapping: for each JSX element, which capture params do its
 * event-handler attributes require on the element's `q:p` var-prop? The walk
 * shape is identical on both sides — only the param resolution differs, so it
 * is injected as a callback:
 *
 * - segment codegen resolves through its `NestedCallSiteInfo` records
 *   (`elementQpParams` with a loop-local fallback);
 * - the inline path resolves through a plain QRL-name → params map and also
 *   needs to know which QRL names matched (`qrlsWithCaptures` drives var/const
 *   prop classification downstream).
 */

import { forEachAstChild } from './ast.js';
import { getJsxAttributeName } from './jsx-attr-name.js';
import { isEventAttributeName } from './event-attrs.js';
import type { AstMaybeNode, JSXAttributeItem } from '../../ast-types.js';

/**
 * Collect the deduplicated q:p capture params contributed by one JSX
 * element's event-handler attributes. An attribute contributes when its value
 * is a bare `Identifier` (a rewritten QRL reference) that `resolveParams`
 * recognises; matched QRL names are added to `qrlsWithCaptures` when the
 * caller provides one.
 */
export function collectQpParamsFromElement(
  attrs: readonly JSXAttributeItem[],
  resolveParams: (qrlName: string) => readonly string[] | undefined,
  qrlsWithCaptures?: Set<string>,
): string[] {
  const elementParams: string[] = [];
  const seen = new Set<string>();

  for (const attr of attrs) {
    if (attr.type !== 'JSXAttribute') continue;

    const attrName = getJsxAttributeName(attr);
    if (!isEventAttributeName(attrName)) continue;
    if (attr.value?.type !== 'JSXExpressionContainer') continue;
    if (attr.value.expression?.type !== 'Identifier') continue;

    const qrlName = attr.value.expression.name;
    const params = resolveParams(qrlName);
    if (!params) continue;

    qrlsWithCaptures?.add(qrlName);
    for (const p of params) {
      if (!seen.has(p)) {
        seen.add(p);
        elementParams.push(p);
      }
    }
  }

  return elementParams;
}

/**
 * Recursively walk an AST, populating `qpOverrides` (element start offset →
 * deduped q:p params) for every JSX element whose event-handler attributes
 * reference a QRL that `resolveParams` recognises.
 */
export function walkAstForQp(
  node: AstMaybeNode,
  resolveParams: (qrlName: string) => readonly string[] | undefined,
  qpOverrides: Map<number, string[]>,
  qrlsWithCaptures?: Set<string>,
): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'JSXElement' && node.openingElement) {
    const elementParams = collectQpParamsFromElement(
      node.openingElement.attributes,
      resolveParams,
      qrlsWithCaptures,
    );
    if (elementParams.length > 0) {
      qpOverrides.set(node.start, elementParams);
    }
  }

  forEachAstChild(node, (child) => walkAstForQp(child, resolveParams, qpOverrides, qrlsWithCaptures));
}
