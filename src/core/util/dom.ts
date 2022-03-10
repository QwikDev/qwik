/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

export function getDocument(node: Node): Document {
  let doc = node.ownerDocument!;
  while (doc && doc.nodeType !== 9) {
    doc = doc.parentNode as any;
  }
  return doc || globalThis.document;
}

export function getParentElement(node: Node): Element | null {
  return node.parentElement || previousParent.get(node) || null;
}

export const previousParent = new WeakMap<Node, Element>();
