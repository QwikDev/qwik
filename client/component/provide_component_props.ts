/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertDefined } from '../assert/index.js';
import { Provider, Injector } from '../injection/types.js';

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
 */
export function provideComponentProps<T>(): Provider<T> {
  return function propsComponentProvider(injector: Injector): T {
    const props = injector.elementProps;
    qDev && assertDefined(props);
    return (props as any) as T;
  };
}
