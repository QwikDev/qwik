import type { ValueOrPromise } from './types';

export type PromiseTree<T> = T | Promise<T> | Promise<T[]> | Array<PromiseTree<T>>;

export const isPromise = (value: any): value is Promise<any> => {
  return value instanceof Promise;
};

export const then = <T, B>(
  promise: ValueOrPromise<T>,
  thenFn: (arg: Awaited<T>) => ValueOrPromise<B>,
  rejectFn?: (err: any) => any
): ValueOrPromise<B> => {
  return isPromise(promise) ? promise.then(thenFn as any, rejectFn) : thenFn(promise as any);
};

export const promiseAll = <T extends readonly unknown[] | []>(
  promises: T
): ValueOrPromise<{ -readonly [P in keyof T]: Awaited<T[P]> }> => {
  const hasPromise = promises.some(isPromise);
  if (hasPromise) {
    return Promise.all(promises);
  }
  return promises as any;
};

export const isNotNullable = <T>(v: T): v is NonNullable<T> => {
  return v != null;
};
