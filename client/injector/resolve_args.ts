/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Injector, Provider, ValueOrProviderReturns } from './types.js';

/**
 *
 *
 * @param injector
 * @param args
 * @returns
 */
export function resolveArgs<ARGS extends any[]>(
  injector: Injector,
  ...args: [...ARGS]
): Promise<ValueOrProviderReturns<ARGS>> {
  const argPromises: Promise<any>[] = [];
  for (let i = 0; i < args.length; i++) {
    const valueOrProvider = args[i];
    argPromises.push(
      isProvider(valueOrProvider) ? (valueOrProvider as Provider<any>)(injector) : valueOrProvider
    );
  }
  return Promise.all(argPromises) as Promise<ValueOrProviderReturns<ARGS>>;
}

function isProvider(value: any): value is Provider<any> {
  return typeof value === 'function';
}
