/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

export const enum AttributeMarker {
  /**
   * State factory of the component.
   */
  OnMount = 'on:q-mount',

  /**
   * State factory of the component.
   */
  OnRenderAttr = 'on:q-render',
  OnRenderProp = 'on:qRender',

  /**
   * State factory of the component.
   */
  OnRenderSelector = '[on\\:q\\-render]',

  /**
   * State factory of the component.
   */
  OnUnmount = 'on:q-unmount',

  /**
   * State factory of the component.
   */
  OnHydrate = 'on:q-hydrate',

  /**
   * State factory of the component.
   */
  OnDehydrate = 'on:q-dehydrate',

  /**
   * Component Styles.
   */
  ComponentScopedStyles = 'q:sstyle',

  /**
   * Unscoped Component Styles.
   */
  ComponentUnscopedStyles = 'q:ustyle',

  /**
   * Component style host prefix
   */
  ComponentStylesPrefixHost = '📦',

  /**
   * Component style content prefix
   */
  ComponentStylesPrefixContent = '🏷️',

  /**
   * Prefix used to identify on listeners.
   */
  EventPrefix = 'on:',

  /**
   * Attribute used to mark that an event listener is attached.
   */
  EventAny = 'on:.',

  /**
   * Render event broadcast
   */
  RenderNotify = 'on:q-render-notify',

  /**
   * Selector for all components marked with `EventRender`
   */
  RenderNotifySelector = '[on\\:q-render-notify]',

  /**
   * Tag name used for projection.
   */
  QSlot = 'Q:SLOT',
  QSlotSelector = 'Q\\:SLOT',

  /**
   * `<some-element q:slot="...">`
   */
  QSlotAttr = 'q:slot',

  /**
   * `<q:slot name="...">`
   */
  QSlotName = 'name',
  QSlotInertName = '\u0000',

  ELEMENT_ID = 'q:id',
  ELEMENT_ID_SELECTOR = '[q\\:id="{}"]',
  ELEMENT_ID_PREFIX = '#',
  ELEMENT_ID_Q_PROPS_PREFIX = '&',
}
