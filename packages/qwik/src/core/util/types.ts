/**
 * @private
 */
export const isHtmlElement = (node: any): node is Element => {
  return node ? node.nodeType === 1 : false;
};

export const isSerializableObject = (v: any) => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
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

export type Primitive = string | number | boolean | bigint | symbol | undefined | null;
export type Builtin = Primitive | Function | Date | Error | RegExp;
export type IsTuple<T> = T extends any[] ? (any[] extends T ? never : T) : never;
export type IsAny<T> = 0 extends 1 & T ? true : false;
export type IsUnknown<T> = IsAny<T> extends true ? false : unknown extends T ? true : false;
export type AnyArray<T = any> = Array<T> | ReadonlyArray<T>;

export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
  ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends ReadonlyMap<infer K, infer V>
  ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends WeakMap<infer K, infer V>
  ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends Set<infer U>
  ? ReadonlySet<DeepReadonly<U>>
  : T extends ReadonlySet<infer U>
  ? ReadonlySet<DeepReadonly<U>>
  : T extends WeakSet<infer U>
  ? WeakSet<DeepReadonly<U>>
  : T extends Promise<infer U>
  ? Promise<DeepReadonly<U>>
  : T extends AnyArray<infer U>
  ? T extends IsTuple<T>
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : ReadonlyArray<DeepReadonly<U>>
  : T extends {}
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : IsUnknown<T> extends true
  ? unknown
  : Readonly<T>;
