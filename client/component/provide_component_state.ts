/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { AsyncProvider, Injector } from '../injection/types.js';
import { QError, qError } from '../error/error.js';

/**
 * Provider of Component State.
 *
 * Use this function in conjunction with `inject` to inject Component State into the
 * `InjectedFunction`.
 *
 * See:
 * - STATE.md
 * - `inject`
 * - `Component.$inject`
 *
 * Example:
 * ```
 * export default inject(
 *   null,
 *   provideComponentState<MyComponentState>()
 *   function (myComponentState: MyComponentState) {
 *     ...
 *   }
 * );
 * ```
 *
 * @param throwIfNotFound Should an exception be thrown if state is not found.
 *   (By default the system throws an exception as most of the time state is required)
 */
export function provideComponentState<S>(throwIfNotFound: false): AsyncProvider<S | undefined>;
export function provideComponentState<S>(throwIfNotFound?: boolean): AsyncProvider<S>;
export function provideComponentState<S>(
  throwIfNotFound: boolean = true
): AsyncProvider<S | undefined> {
  return function componentStateProvider(injector: Injector): S | undefined {
    const state = injector.element.getAttribute(':.');
    if (state == null) {
      if (throwIfNotFound) {
        throw qError(QError.Component_needsState);
      } else {
        return undefined;
      }
    }
    return JSON.parse(state);
  };
}
