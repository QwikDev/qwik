import { assertDefined } from '../assert/assert';
import { isServer } from '../platform/platform';
import type { QwikElement } from '../render/dom/virtual-element';

export const getDocument = (node: QwikElement | Document): Document => {
  if (!isServer()) {
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
