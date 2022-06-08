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
