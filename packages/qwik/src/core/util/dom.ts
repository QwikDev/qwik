import { assertDefined } from '../assert/assert';

export const getDocument = (node: Node): Document => {
  if (typeof document !== 'undefined') {
    return document;
  }
  if (node.nodeType === 9) {
    return node as Document;
  }
  const doc = node.ownerDocument;
  assertDefined(doc, 'doc must be defined');
  return doc!;
};
