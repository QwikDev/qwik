import type { ValueOrPromise } from './types';
import { flattenArray } from './array';

export type PromiseTree<T> = T | Promise<T> | Promise<T[]> | Array<PromiseTree<T>>;

/**
 * Converts a tree of Promises into a flat array of resolved promise values.
 *
 * @param tree - array of arrays of values or promises of values.
 * @returns a `Promise` of array of values.
 */
export function flattenPromiseTree<T>(tree: PromiseTree<T>): Promise<T[]> {
  return Promise.all(tree as T[]).then((values: any[]) => {
    const flatArray = flattenArray(values);
    for (let i = 0; i < flatArray.length; i++) {
      if (isPromise(flatArray[i])) {
        return flattenPromiseTree(flatArray);
      }
    }
    return flatArray;
  });
}

export function isPromise(value: any): value is Promise<any> {
  return value instanceof Promise;
}

export const then = <T, B>(
  promise: ValueOrPromise<T>,
  thenFn: (arg: Awaited<T>) => ValueOrPromise<B>
): ValueOrPromise<B> => {
  return isPromise(promise) ? promise.then(thenFn as any) : thenFn(promise as any);
};

export const promiseAll = <T extends any[]>(promises: T): ValueOrPromise<T> => {
  const hasPromise = promises.some(isPromise);
  if (hasPromise) {
    return Promise.all(promises);
  }
  return promises;
};
