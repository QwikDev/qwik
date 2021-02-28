/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { isPromise } from '../util/promises.js';
import { Component } from './component.js';
import { ComponentType } from './types.js';
import { AsyncProvider, InjectionContext } from '../injection/types.js';
import { findHostElement } from './traversal.js';
import { ElementExpando } from './types.js';

/**
 * Provider of Component.
 *
 * Use this function in conjunction with `inject` to inject Component into the
 * `InjectedFunction` or `InjectableConcreteType`.
 *
 * Components are transient (meaning they are not serialized from the server.)
 * For this reason this function will lazy create component if needed.
 *
 * Component is store at the nearest [host-element](./HOST_ELEMENT.md). A host-element
 * is demarcated with the `::` attribute pointing to the render import. The component
 * instance is patched onto the host-element so that it does not have to be created
 * next time.
 *
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
 *   provideComponent(MyComponent)
 *   function (myComponent: MyComponent) {
 *     ...
 *   }
 * );
 * ```
 *
 * @param componentType
 */ export function provideComponent<C extends Component<any, any>>(
  componentType: ComponentType<C, any[]>
): AsyncProvider<C> {
  return function componentProvider(this: InjectionContext): C | Promise<C> {
    const expando = findHostElement(this) as ElementExpando<C>;
    // TODO: uncomment
    // qDev && assertComponentElement(hostElement);
    let component: C | Promise<C> | undefined = expando.$QOOT_COMPONENT;
    if (component === undefined) {
      component = expando.$QOOT_COMPONENT = componentType.newInject(this) as C;
      if (isPromise(component)) {
        component.then((component) => (expando.$QOOT_COMPONENT = component as C));
      }
    }
    return component;
  };
}
