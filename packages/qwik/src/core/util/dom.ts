import { assertDefined } from '../error/assert';
import type { QwikElement } from '../render/dom/virtual-element';
import { qDynamicPlatform } from './qdev';

export const getDocument = (node: QwikElement | Document): Document => {
  if (!qDynamicPlatform) {
    return document;
  }
  if (typeof document !== 'undefined') {
    return document;
  }
  if (node.nodeType === 9) {
    return node as any as Document;
  }
  const doc = node.ownerDocument;
  assertDefined(doc, 'doc must be defined');
  return doc!;
};
