/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { newError } from '../assert/index.js';
import { Provider, InjectionContext } from '../injection/types.js';
import { findHostElement } from './traversal.js';

/**
 * Provider of Component State.
 *
 * Use this function in conjunction with `inject` to inject Component State into the
 * `InjectedFunction` or `InjectableConcreteType`.
 *
 * See:
 * - STATE.md
 * - `inject`
 * - `Component.$inject`
 * - `InjectableConcreteType`
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
export function provideComponentState<S>(throwIfNotFound: false): Provider<S | undefined>;
export function provideComponentState<S>(throwIfNotFound?: boolean): Provider<S>;
export function provideComponentState<S>(throwIfNotFound: boolean = true): Provider<S | undefined> {
  return function componentStateProvider(this: InjectionContext): S | undefined {
    const hostElement = findHostElement(this);
    const state = hostElement.getAttribute(':.');
    if (state == null) {
      if (throwIfNotFound) {
        throw newError("Can't find state on host element.");
      } else {
        return undefined;
      }
    }
    return JSON.parse(state);
  };
}
