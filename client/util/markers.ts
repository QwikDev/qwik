/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

export const enum AttributeMarker {
  /**
   * An `Element` marked with `:` contains an `Injector`.
   */
  Injector = ':',

  /**
   * Selector to be used to retrieve all of the injectors.
   */
  InjectorSelector = '[\\:]',

  /**
   * An `Element` marked with `::` marks a component.
   *
   * The value of `::` points to a `QRL` of a template function for the component.
   */
  ComponentTemplate = '::',

  /**
   * Component state is serialized in `:.`.
   */
  ComponentState = ':.',

  /**
   * Selector to be used to retrieve all of the components
   */
  ComponentSelector = '[\\:\\:]',
}
