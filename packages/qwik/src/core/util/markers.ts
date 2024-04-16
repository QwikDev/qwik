/** State factory of the component. */
export const OnRenderProp = 'q:renderFn';

/** Component style host prefix */
export const ComponentStylesPrefixHost = '💎';

/** Component style content prefix */
export const ComponentStylesPrefixContent = '⭐️';

/** Prefix used to identify on listeners. */
export const EventPrefix = 'on:';

/** Attribute used to mark that an event listener is attached. */
export const EventAny = 'on:.';
/** `<some-element q:slot="...">` */
export const QSlot = 'q:slot';
export const QSlotParent = ':';
export const QSlotRef = 'q:sref';
export const QSlotS = 'q:s';
export const QStyle = 'q:style';
export const QStyleSelector = 'style[q\\:style]';
export const QStyleSSelector = 'style[q\\:sstyle]';
export const QStylesAllSelector = QStyleSelector + ',' + QStyleSSelector;
export const QScopedStyle = 'q:sstyle';
export const QCtxAttr = 'q:ctx';

export const QLocaleAttr = 'q:locale';
export const QContainerAttr = 'q:container';

export const QTemplate = 'q:template';

export const QContainerSelector = '[q\\:container]';

export const ResourceEvent = 'qResource';
export const ComputedEvent = 'qComputed';
export const RenderEvent = 'qRender';
export const TaskEvent = 'qTask';

/** `<q:slot name="...">` */
export const QSlotInertName = '\u0000';

/**
 * Attribute to mark that this VNode has a pointer to itself from the `qwik/json` state.
 *
 * As the VNode get materialized the vnode now becomes eligible for mutation. Once the vnode mutates
 * the `VNode` references from the `qwik/json` may become invalid. For this reason, these references
 * need to be eagerly resolved. `VNODE_REF` stores a pointer to "this" vnode. This allows the system
 * to eagerly resolve these pointes as the vnodes are materialized.
 */
export const ELEMENT_ID = 'q:id';
export const ELEMENT_KEY = 'q:key';
export const ELEMENT_PROPS = 'q:props';
export const ELEMENT_SEQ = 'q:seq';
export const ELEMENT_SELF_ID = -1;
export const ELEMENT_ID_SELECTOR = '[q\\:id]';
export const ELEMENT_ID_PREFIX = '#';
export const INLINE_FN_PREFIX = '@';
