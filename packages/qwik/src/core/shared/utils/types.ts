/** @private */
export const isHtmlElement = (node: unknown): node is Element => {
  return node ? (node as Node).nodeType === 1 : false;
};

export const isSerializableObject = (v: unknown): v is Record<string, unknown> => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === Array.prototype || proto === null;
};

export const isObject = (v: unknown): v is object => {
  return typeof v === 'object' && v !== null;
};

export const isArray = (v: unknown): v is unknown[] => {
  return Array.isArray(v);
};

export const isString = (v: unknown): v is string => {
  return typeof v === 'string';
};

export const isNumber = (v: unknown): v is number => {
  return typeof v === 'number';
};

export const isFunction = <T extends (...args: any) => any>(v: unknown): v is T => {
  return typeof v === 'function';
};

export const isPrimitive = (
  v: unknown
): v is string | number | boolean | null | undefined | symbol => {
  return typeof v !== 'object' && typeof v !== 'function' && v !== null && v !== undefined;
};

/**
 * Type representing a value which is either resolve or a promise.
 *
 * @public
 */
export type ValueOrPromise<T> = T | Promise<T>;
