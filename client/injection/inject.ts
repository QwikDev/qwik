/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { isPromise } from '../util/promises.js';
import {
  AsyncProvider,
  InjectableConcreteType,
  InjectedFunction,
  InjectionContext,
  isInjectableConcreteType,
} from './types.js';

/**
 * An event handler associated with a component.
 *
 * @param args Takes a list of `async` functions. The 0 through n-1 functions compute a value
 *   and the last function is invoked as a handler with the compute value. The last function
 *   is invoked with `this` pointing to the transient component state.
 */
//export function inject(...functions: (Function | null)[]): AsyncProvider<unknown> {
export function inject<SELF, ARGS extends any[], RET>(
  ...args: [
    AsyncProvider<SELF> | InjectableConcreteType<SELF, any[]> | null,
    ...ARGS,
    InjectedFunction<SELF, ARGS, RET>
  ]
): AsyncProvider<RET> {
  const method = args.pop() as Function; // InjectedFunction<SELF, ARGS, RET>;
  const injectProviders = args;

  return function injectResolver(this: InjectionContext, ...additionalArgs: any[]) {
    const providerValues: ARGS = [] as any;
    let hasPromises = false;
    for (let i = 0; i < injectProviders.length; i++) {
      let resolver = injectProviders[i];
      if (isInjectableConcreteType(resolver)) {
        resolver = resolver.resolver;
      }
      const resolvedValue = resolver === null ? resolver : resolver.call(this);
      providerValues.push(resolvedValue);
      if (!hasPromises && isPromise(resolvedValue)) {
        hasPromises = true;
      }
    }

    return hasPromises
      ? Promise.all(providerValues).then(function injectArgsResolve(providerValues) {
          return method.call(providerValues.shift(), ...providerValues, ...additionalArgs);
        })
      : method.call(providerValues.shift(), ...providerValues, ...additionalArgs);
  };
}
