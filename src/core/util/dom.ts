/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

/**
 * Remove `childNode` from `parentNode` and return `nextSibling`
 */
export function removeNode(parentNode: Node, childNode: Node): Node | null {
  const nextSibling = childNode.nextSibling as Node | null;
  previousParent.set(childNode, parentNode as Element);
  parentNode.removeChild(childNode);
  return nextSibling;
}

/**
 * Replace `existingNode` with `newNode`
 */
export function replaceNode<T extends Node>(
  parentNode: Node,
  existingNode: Node | null,
  newNode: T
): T {
  parentNode.insertBefore(newNode, existingNode);
  if (existingNode) {
    previousParent.set(existingNode, parentNode as Element);
    parentNode.removeChild(existingNode);
  }
  return newNode;
}

export function getParentElement(node: Node): Element | null {
  return node.parentElement || previousParent.get(node) || null;
}

export const previousParent = new WeakMap<Node, Element>();
