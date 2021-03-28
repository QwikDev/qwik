/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

/**
 * Remove `childNode` from `parentNode` and return `nextSibling`
 */
export function removeNode(parentNode: Node, childNode: Node): Node | null {
  const nextSibling = childNode.nextSibling as Node | null;
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
  existingNode && parentNode.removeChild(existingNode);
  return newNode;
}
