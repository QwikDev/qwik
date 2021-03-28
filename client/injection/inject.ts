/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import '../util/qDev.js';
import { ConcreteType, InjectedFunction, ProviderReturns } from './types.js';

/**
 * An event handler associated with a component.
 *
 * @param args Takes a list of `async` functions. The 0 through n-1 functions compute a value
 *   and the last function is invoked as a handler with the compute value. The last function
 *   is invoked with `this` pointing to the transient component state.
 */
export function injectFunction<ARGS extends any[], REST extends any[], RET>(
  ...args: [...ARGS, (...args: [...ProviderReturns<ARGS>, ...REST]) => RET]
): InjectedFunction<null, ARGS, REST, RET> {
  const fn = (args.pop() as any) as InjectedFunction<null, ARGS, REST, RET>;
  fn.$thisType = null;
  fn.$inject = args as any;
  qDev && (fn.$debugStack = new Error());
  return fn;
}

export function injectMethod<SELF, ARGS extends any[], REST extends any[], RET>(
  ...args: [
    ConcreteType<SELF>,
    ...ARGS,
    (this: SELF, ...args: [...ProviderReturns<ARGS>, ...REST]) => RET
  ]
): InjectedFunction<SELF, ARGS, REST, RET> {
  const fn = (args.pop() as any) as InjectedFunction<SELF, ARGS, REST, RET>;
  fn.$thisType = args.shift() as ConcreteType<SELF>;
  fn.$inject = args as any;
  qDev && (fn.$debugStack = new Error());
  return fn;
}
