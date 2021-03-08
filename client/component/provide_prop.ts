/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {
  ComponentInjector,
  createComponentInjector,
  getComponentHost,
} from '../injection/element_injector.js';
import { qError, QError } from '../error/error.js';
import { Injector, AsyncProvider } from '../injection/types.js';
import { getStorage } from '../injection/storage.js';

/**
 * Provides the Component Property.
 *
 * The Component Properties are read from `InjectionContext` or from the host-element
 * if the `InjectionContext` does not have them.
 *
 * The attributes follow these rules:
 * - all attributes which contain `:` are ignored as these are control attributes and
 *   never part of bindings.
 * - All property keys are translated from kebab to camel case (with first char being
 *   lowercase)
 * - `bind:` properties are stored reversed. (Binding id is stored in attribute key and
 *   binding property is stored in attribute value. [Reason: so that Qoot can use
 *   `querySelectAll` to find all binding ids in case of an update.])
 *
 * Example
 * ```
 * <div prop-a="ValueA"
 *       bind:id="propB;propC"
 *       :="ignore">
 * ```
 * Results in:
 * ```
 * {
 *   propA: 'ValueA',
 *   propB: 'id',
 *   propC: 'id',
 * }
 * ```
 *
 * @param name Name of the property to inject.
 * @returns
 */
export function provideComponentProp(name: string): AsyncProvider<string> {
  return function componentPropProvider(injector: Injector): string {
    const componentInjector = getComponentInjector(injector);
    const props = componentInjector.props;
    // TODO: validation / cast
    const value = props[name] as string;
    if (value == null) {
      throw qError(QError.Component_noProperty_propName_host, name, componentInjector.element);
    }
    return value;
  };
}

function getComponentInjector(injector: Injector) {
  const componentElement = getComponentHost(injector.element);
  const storage = getStorage(componentElement);
  let componentInjector = (storage.get(':.') as any) as ComponentInjector;
  if (!componentInjector) {
    componentInjector = createComponentInjector(componentElement, null);
    storage.set(':.', componentInjector as any);
  }
  return componentInjector;
}
