/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { flattenArray } from './array.js';

export type PromiseTree<T> = T | Promise<T> | Array<PromiseTree<T>>;

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

export function isPromise(value: any): value is Promise<unknown> {
  return value instanceof Promise;
}
