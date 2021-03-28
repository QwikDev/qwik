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
 * Decorate a function for injection by associating providers.
 *
 * Invoking a function through an injector allows the function to declaratively list a set
 * of values which are needed by the function. The values can be services, components or props.
 * The advantage of declarative approach is that the injector takes care of locating the values
 * as well as delaying the invocation until all the values have been resolved and or lazy loaded.
 *
 * Unlike `injectMethod`, `injectFunction` does not allow specifying of the `this` type.
 *
 * see: `injectMethod`
 *
 * # Example:
 *
 * ```
 * export const myFn =  injectFunction(
 *   provideService<MyService>(provideComponentProp('$myKey')),
 *   function (itemsService: ItemsService) {
 *     ...
 *   }
 * );
 *
 * await injector.invoke(myFn);
 * ```
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

/**
 * Decorate a method for injection by associating providers.
 *
 * Invoking a method through an injector allows the function to declaratively list a set
 * of values which are needed by the method. The values can be services, components or props.
 * The advantage of declarative approach is that the injector takes care of locating the values
 * as well as delaying the invocation until all the values have been resolved and or lazy loaded.
 *
 * Unlike `injectFunction`, `injectMethod` allows specifying of the `this` type. `this` type is
 * only used for verification and it is not used for lookup. `injectMethod` is meant to be used with
 * `Injector.invoke`.
 *
 * see: `injectFunction`
 *
 * # Example:
 *
 * ```
 * export const greet = injectMethod(
 *   GreeterService,
 *   provideService<MyService>(provideComponentProp('$myKey')),
 *   function (this: GreeterService, myService: MyService) {
 *     return (this.$state.greeting = this.$props.salutation + ' ' + this.$props.name + '!');
 *   }
 * );
 *
 * await injector.invoke(greet, new GreetService());
 * ```
 *
 * @param args Takes a list of `async` functions. The 0 through n-1 functions compute a value
 *   and the last function is invoked as a handler with the compute value. The last function
 *   is invoked with `this` pointing to the transient component state.
 */
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
