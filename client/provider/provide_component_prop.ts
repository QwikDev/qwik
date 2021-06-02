/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { qError, QError } from '../error/error.js';
import { getClosestInjector } from '../injector/element_injector.js';
import { Provider, Injector } from '../injector/types.js';

/**
 * Provides the Component Property.
 *
 * The Component Properties are read from `Injector` or from the host-element
 * if the `Injector` does not have them.
 *
 * The attributes follow these rules:
 * - all attributes which contain `:` are ignored as these are control attributes and
 *   never part of bindings.
 * - All property keys are translated from kebab to camel case (with first char being
 *   lowercase)
 * - `bind:` properties are stored reversed. (Binding id is stored in attribute key and
 *   binding property is stored in attribute value. [Reason: so that Qwik can use
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
 * @param name - Name of the property to inject.
 * @returns
 * @public
 */
export function provideComponentProp(name: string): Provider<string> {
  return function componentPropProvider(injector: Injector): string {
    const elementInjector = getClosestInjector(injector.element);
    const props = elementInjector.elementProps;
    const value = props[name] as string;
    if (value == null) {
      throw qError(
        QError.Component_noProperty_propName_props_host,
        name,
        elementInjector.elementProps,
        elementInjector.element
      );
    }
    return value;
  };
}
