/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { assertDefined } from '../assert/index';
import type { Provider, Injector } from '../injector/types';

/**
 * Returns `Props` of component.
 *
 * This function finds the closest host-element and than collects its attributes
 * into `Props`.
 * See:
 * - STATE.md
 * - `inject`
 * - `Component`
 * - `Component.$inject`
 *
 * Example:
 * ```
 * export default inject(
 *   null,
 *   provideComponentProps<MyProps>()
 *   function (myProps: MyProps) {
 *     ...
 *   }
 * );
 * ```
 * @public
 */
export function provideComponentProps<T>(): Provider<T> {
  return function propsComponentProvider(injector: Injector): T {
    const props = injector.elementProps;
    assertDefined(props);
    return props as any as T;
  };
}
