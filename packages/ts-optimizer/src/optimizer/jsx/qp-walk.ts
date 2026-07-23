/**
 * Shared q:p collection walk for both emit paths (segment codegen and inline/hoist). The walk shape
 * is identical; only param resolution differs, so it's injected as `resolveParams`. Matched QRL
 * names feed `qrlsWithCaptures`, which drives downstream var/const prop classification.
 */

import { forEachAstChild } from '../ast/guards.js';
import { getJsxAttributeName } from './jsx-attr-name.js';
import { isEventAttributeName } from '../qwik/event-attrs.js';
import type { AstMaybeNode, JSXAttributeItem } from '../../ast-types.js';

export function collectQpParamsFromElement(
  attrs: readonly JSXAttributeItem[],
  resolveParams: (qrlName: string) => readonly string[] | undefined,
  qrlsWithCaptures?: Set<string>
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

export function walkAstForQp(
  node: AstMaybeNode,
  resolveParams: (qrlName: string) => readonly string[] | undefined,
  qpOverrides: Map<number, string[]>,
  qrlsWithCaptures?: Set<string>
): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'JSXElement' && node.openingElement) {
    const elementParams = collectQpParamsFromElement(
      node.openingElement.attributes,
      resolveParams,
      qrlsWithCaptures
    );
    if (elementParams.length > 0) {
      qpOverrides.set(node.start, elementParams);
    }
  }

  forEachAstChild(node, (child) =>
    walkAstForQp(child, resolveParams, qpOverrides, qrlsWithCaptures)
  );
}
