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
  return node ? node.nodeType === 1 : false;
}

/**
 * Type representing a value which is either resolve or a promise.
 * @public
 */
export type ValueOrPromise<T> = T | Promise<T>;
