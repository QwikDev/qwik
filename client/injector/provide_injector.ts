/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Injector, Provider } from './types.js';

/**
 * Provide `Injector`.
 *
 * Provides a reference to the closet `Injector`. This may be the `EventInjector`
 * if the provider was use in an `injectEventHandler`.
 *
 * @public
 */
export function provideInjector(): Provider<Injector> {
  return async function resolveInjector(injector: Injector): Promise<Injector> {
    return injector;
  };
}
