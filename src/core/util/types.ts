import { QHostAttr, QSlotAttr } from './markers';

/**
 * Returns true if the `node` is `Element` and of the right `tagName`.
 *
 * @param node
 * @private
 */
export function isDomElementWithTagName(
  node: Node | null | undefined,
  tagName: string
): node is Element {
  return isHtmlElement(node) && node.tagName.toUpperCase() == tagName.toUpperCase();
}

/**
 * @private
 */
export function isTemplateElement(node: Node | null | undefined): node is HTMLTemplateElement {
  return isDomElementWithTagName(node, 'template');
}

/**
 * @private
 */
export function isQSLotTemplateElement(node: Node | null | undefined): node is HTMLTemplateElement {
  return isTemplateElement(node) && node.hasAttribute(QSlotAttr);
}

/**
 * @private
 */
export function isComponentElement(node: Node | null | undefined): node is HTMLElement {
  return isHtmlElement(node) && node.hasAttribute(QHostAttr);
}

/**
 * @private
 */
export function isHtmlElement(node: any): node is Element {
  return node ? node.nodeType === NodeType.ELEMENT_NODE : false;
}

/**
 * Type representing a value which is either resolve or a promise.
 * @public
 */
export type ValueOrPromise<T> = T | Promise<T>;

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
