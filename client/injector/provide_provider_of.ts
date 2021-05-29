/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Injector, Provider } from './types.js';

/**
 * Provide a function for lazy retrieving the provider.
 *
 * Example:
 * ```
 * export default injectEventHandler(
 *   provideProviderOf(provideEntity<MyEntity>('myentity:123')),
 *   async function(myEntityProvider: () => MyEntity) {
 *     if (someCondition) {
 *       const entity = await myEntityProvider();
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
