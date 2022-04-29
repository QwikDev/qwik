import { assertDefined } from '../assert/assert';

export function getDocument(node: Node): Document {
  if (typeof document !== 'undefined') {
    return document;
  }
  if (node.nodeType === 9) {
    return node as Document;
  }
  let doc = node.ownerDocument;
  while (doc && doc.nodeType !== 9) {
    doc = doc.parentNode as any;
  }
  assertDefined(doc);
  return doc!;
}

export function getParentElement(node: Node): Element | null {
  return node.parentElement || previousParent.get(node) || null;
}

export const previousParent = new WeakMap<Node, Element>();
