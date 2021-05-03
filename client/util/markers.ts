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
  ComponentTemplate = 'decl:template',

  /**
   * Props used to declare services.
   */
  Services = 'decl:services',

  /**
   * Component state is serialized in `:.`.
   */
  ComponentState = ':.',

  /**
   * Selector to be used to retrieve all of the components
   */
  ComponentSelector = '[\\:\\:]',

  /**
   * Prefix used to identify on listeners.
   */
  EventPrefix = 'on:',

  /**
   * Render event broadcast
   */
  // TODO(this should be `on:$render` but domino incorrectly claims that is invalid char. Switch to jsdom?)
  EventRender = 'on:.render',

  /**
   * Selector for all components marked with `EventRender`
   */
  EventRenderSelector = '[on\\:\\.render]',

  /**
   * Prefix used to identify on listeners.
   */
  BindPrefix = 'bind:',

  /**
   * Length of prefix used to identify on listeners.
   */
  BindPrefixLength = 5,

  /**
   * Prefix to name for service provider attributes.
   */
  ServiceProviderPrefix = '::',
}
