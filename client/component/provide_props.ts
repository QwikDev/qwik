/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertDefined } from '../assert/index.js';
import { AsyncProvider, InjectionContext } from '../injection/types.js';
import { readElementAttributes } from '../util/dom.js';
import { findHostElement } from './traversal.js';

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
  return function propsProvider(this: InjectionContext): T {
    let props = this.props!;
    if (props === undefined) {
      const hostElement = findHostElement(this);
      props = readElementAttributes(hostElement);
    }
    qDev && assertDefined(props);
    return (props as any) as T;
  };
}
