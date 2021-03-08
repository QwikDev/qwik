/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { getBaseUri } from '../util/base_uri.js';
import '../util/qDev.js';
import {
  AsyncProvider,
  AsyncProviders,
  InjectableConcreteType,
  InjectedFunction,
  isInjectableConcreteType,
  ProviderReturns,
} from './types.js';

/**
 * An event handler associated with a component.
 *
 * @param args Takes a list of `async` functions. The 0 through n-1 functions compute a value
 *   and the last function is invoked as a handler with the compute value. The last function
 *   is invoked with `this` pointing to the transient component state.
 */
export function inject<SELF, ARGS extends any[], REST extends any[], RET>(
  ...args: [
    AsyncProvider<SELF> | InjectableConcreteType<SELF, any[]> | null,
    ...ARGS,
    (this: SELF, ...args: [...ProviderReturns<ARGS>, ...REST]) => RET
  ]
): InjectedFunction<SELF, ARGS, REST, RET> {
  const fn = (args.pop() as any) as InjectedFunction<SELF, ARGS, REST, RET>;
  fn.$inject = convertTypesToProviders<SELF, ARGS>(args);
  qDev && (fn.$debugStack = new Error());
  return fn;
}

export function convertTypesToProviders<SELF, ARGS extends any[]>(
  args: any[]
): AsyncProviders<[SELF, ...ARGS]> {
  return args.map((provider) =>
    isInjectableConcreteType(provider) ? provider.$resolver : provider
  ) as AsyncProviders<[SELF, ...ARGS]>;
}
