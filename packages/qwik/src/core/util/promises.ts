import type { ValueOrPromise } from './types';

export type PromiseTree<T> = T | Promise<T> | Promise<T[]> | Array<PromiseTree<T>>;

export const isPromise = (value: any): value is Promise<any> => {
  // not using "value instanceof Promise" to have zone.js support
  return value && typeof value.then === 'function';
};

export const safeCall = <T, B, C>(
  call: () => ValueOrPromise<T>,
  thenFn: { f(arg: Awaited<T>): ValueOrPromise<B> }['f'],
  rejectFn: { f(reason: any): ValueOrPromise<C> }['f']
): ValueOrPromise<B | C> => {
  try {
    const promise = call();
    if (isPromise(promise)) {
      return promise.then(thenFn as any, rejectFn);
    } else {
      return thenFn(promise as any);
    }
  } catch (e) {
    return rejectFn(e);
  }
};

export const maybeThen = <T, B>(
  promise: ValueOrPromise<T>,
  thenFn: (arg: Awaited<T>) => ValueOrPromise<B>
): ValueOrPromise<B> => {
  return isPromise(promise) ? promise.then(thenFn as any) : thenFn(promise as any);
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

export const promiseAllLazy = <T extends readonly unknown[] | []>(
  promises: T
): ValueOrPromise<void> => {
  if (promises.length > 0) {
    return Promise.all(promises) as any;
  }
  return promises as any;
};

export const isNotNullable = <T>(v: T): v is NonNullable<T> => {
  return v != null;
};

export const delay = (timeout: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};
