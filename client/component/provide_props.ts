/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ensureElementInjector } from '../injection/element_injector.js';
import { assertDefined } from '../assert/index.js';
import { AsyncProvider, Injector } from '../injection/types.js';

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
 *   provideProps<MyProps>()
 *   function (myProps: MyProps) {
 *     ...
 *   }
 * );
 * ```
 */
export function provideProps<T>(): AsyncProvider<T> {
  return function propsProvider(injector: Injector): T {
    const elementInjector = ensureElementInjector(injector);
    let props = elementInjector.elementProps;
    qDev && assertDefined(props);
    return (props as any) as T;
  };
}
