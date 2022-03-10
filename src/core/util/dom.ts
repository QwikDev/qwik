/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { assertDefined } from '../assert/assert';

export function getDocument(node: Node): Document {
  if (typeof document !== 'undefined') {
    return document;
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
