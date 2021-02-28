/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { caseInsensitiveCompare } from './string.js';

/**
 * Returns true if the `node` is `Element` and of the right `tagName`.
 *
 * @param node
 */
export function isDomElementWithTagName(
  node: Node | null | undefined,
  tagName: string
): node is Element {
  return isHtmlElement(node) && caseInsensitiveCompare(node.tagName, tagName);
}

export function isHtmlElement(node: Node | null | undefined): node is Element {
  return node ? node.nodeType === NodeType.ELEMENT_NODE : false;
}

export function isTextNode(node: Node | null | undefined): node is Text {
  return node ? node.nodeType === NodeType.TEXT_NODE : false;
}

/**
 * `Node.type` enumeration
 */
export const enum NodeType {
  ELEMENT_NODE = 1, // An Element node like <p> or <div>.
  ATTRIBUTE_NODE = 2, // An Attribute of an Element.
  TEXT_NODE = 3, // The actual Text inside an Element or Attr.
  CDATA_SECTION_NODE = 4, // A CDATASection, such as <!CDATA[[ … ]]>.
  PROCESSING_INSTRUCTION_NODE = 7, // A ProcessingInstruction of an XML
  // document, such as <?xml-stylesheet … ?>.
  COMMENT_NODE = 8, // A Comment node, such as <!-- … -->.
  DOCUMENT_NODE = 9, // A Document node.
  DOCUMENT_TYPE_NODE = 10, // A DocumentType node, such as <!DOCTYPE html>.
  DOCUMENT_FRAGMENT_NODE = 11, // A DocumentFragment node.
}

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

/**
 * Read attributes from `Element` and return them as an object literal.
 *
 * NOTE: This function ignores all special attributes such as `::`.
 *
 * @param element Element to read attributes from.
 */
export function readElementAttributes(element: Element): { [attribute: string]: string } {
  const props: { [attribute: string]: string } = {};
  const attrs = element.attributes;
  // todo: extract to utility function
  for (let i = 0, ii = attrs.length; i < ii; i++) {
    const attr = attrs[i];
    const name = attr.name;
    if (name.indexOf(':') == -1 && name.indexOf('.') == -1) {
      // ignore all special attributes.
      (props as { [key: string]: string })[name] = attr.value;
    }
  }
  return props;
}
