/**
 * @license
 * Copyright Builder.io; Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

/**
 * State factory of the component.
 */
export const OnMount = 'on:q-mount';

/**
 * State factory of the component.
 */
export const OnRenderAttr = 'on:q-render';
export const OnRenderProp = 'on:qRender';

/**
 * State factory of the component.
 */
export const OnRenderSelector = '[on\\:q\\-render]';

/**
 * State factory of the component.
 */
export const OnUnmount = 'on:q-unmount';

/**
 * State factory of the component.
 */
export const OnHydrate = 'on:q-hydrate';

/**
 * State factory of the component.
 */
export const OnDehydrate = 'on:q-dehydrate';

/**
 * Component Styles.
 */
export const ComponentScopedStyles = 'q:sstyle';

/**
 * Unscoped Component Styles.
 */
export const ComponentUnscopedStyles = 'q:ustyle';

/**
 * Component style host prefix
 */
export const ComponentStylesPrefixHost = '📦';

/**
 * Component style content prefix
 */
export const ComponentStylesPrefixContent = '🏷️';

/**
 * Prefix used to identify on listeners.
 */
export const EventPrefix = 'on:';

/**
 * Attribute used to mark that an event listener is attached.
 */
export const EventAny = 'on:.';

/**
 * Render event broadcast
 */
export const RenderNotify = 'on:q-render-notify';

/**
 * Selector for all components marked with `EventRender`
 */
export const RenderNotifySelector = '[on\\:q-render-notify]';

/**
 * Tag name used for projection.
 */
export const QSlot = 'Q:SLOT';
export const QSlotSelector = 'Q\\:SLOT';

/**
 * `<some-element q:slot="...">`
 */
export const QSlotAttr = 'q:slot';

export const QObjAttr = 'q:obj';

export const QObjSelector = '[q\\:obj]';

/**
 * `<q:slot name="...">`
 */
export const QSlotName = 'name';
export const QSlotInertName = '\u0000';

export const ELEMENT_ID = 'q:id';
export const ELEMENT_ID_SELECTOR = '[q\\:id]';
export const ELEMENT_ID_PREFIX = '#';
export const ELEMENT_ID_Q_PROPS_PREFIX = '&';
