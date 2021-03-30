/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Injector, Provider } from './types.js';

/**
 * Provide a function for lazy retrieving the provider.
 *
 * Example:
 * ```
 * export default injectEventHandler(
 *   provideProviderOf(provideService<MyService>('myservice:123')),
 *   async function(myServiceProvider: () => MyService) {
 *     if (someCondition) {
 *       const service = await myServiceProvider();
 *     }
 *   }
 * )
 * ```
 *
 * @param provider - `Provider` to wrap in lazy provider.
 * @public
 */
export function provideProviderOf<T>(provider: Provider<T>): Provider<() => Promise<T>> {
  return async function resolveInjector(injector: Injector): Promise<() => Promise<T>> {
    return () => {
      return Promise.resolve(provider(injector));
    };
  };
}
