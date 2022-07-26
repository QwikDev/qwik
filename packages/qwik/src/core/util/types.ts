/**
 * @private
 */
export const isHtmlElement = (node: any): node is Element => {
  return node ? node.nodeType === 1 : false;
};

export const isObject = (v: any): v is any => {
  return v && typeof v === 'object';
};

export const isArray = (v: any): v is any[] => {
  return Array.isArray(v);
};

export const isString = (v: any): v is string => {
  return typeof v === 'string';
};

export const isFunction = (v: any): v is Function => {
  return typeof v === 'function';
};

/**
 * Type representing a value which is either resolve or a promise.
 * @public
 */
export type ValueOrPromise<T> = T | Promise<T>;
