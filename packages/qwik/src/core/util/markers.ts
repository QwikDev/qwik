/**
 * State factory of the component.
 */
export const OnMount = 'on:qmount';

/**
 * State factory of the component.
 */
export const QHostAttr = 'q:host';
export const OnRenderProp = 'q:renderFn';

/**
 * State factory of the component.
 */
export const QHostSelector = '[q\\:host]';

/**
 * State factory of the component.
 */
export const OnUnmount = 'on:qunmount';

/**
 * State factory of the component.
 */
export const OnResume = 'on:qinit';

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
export const ComponentStylesPrefixHost = '💎';

/**
 * Component style content prefix
 */
export const ComponentStylesPrefixContent = '⭐️';

/**
 * Prefix used to identify on listeners.
 */
export const EventPrefix = 'on:';

/**
 * Attribute used to mark that an event listener is attached.
 */
export const EventAny = 'on:.';
/**
 * `<some-element q:slot="...">`
 */
export const QSlot = 'q:slot';

export const QCtxAttr = 'q:ctx';

export const QContainerAttr = 'q:container';

export const QContainerSelector = '[q\\:container]';

export const RenderEvent = 'qRender';
/**
 * `<q:slot name="...">`
 */
export const QSlotName = 'name';
export const QSlotInertName = '\u0000';

export const ELEMENT_ID = 'q:id';
export const ELEMENT_ID_SELECTOR = '[q\\:id]';
export const ELEMENT_ID_PREFIX = '#';
export const ELEMENT_ID_Q_PROPS_PREFIX = '&';
