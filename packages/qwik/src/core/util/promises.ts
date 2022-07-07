import type { ValueOrPromise } from './types';

export type PromiseTree<T> = T | Promise<T> | Promise<T[]> | Array<PromiseTree<T>>;

export const isPromise = (value: any): value is Promise<any> => {
  return value instanceof Promise;
};

export const safeCall = <T, B, C>(
  call: () => ValueOrPromise<T>,
  thenFn: (arg: Awaited<T>) => ValueOrPromise<B>,
  rejectFn: (reason: any) => C
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

export const then = <T, B>(
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

export const isNotNullable = <T>(v: T): v is NonNullable<T> => {
  return v != null;
};
