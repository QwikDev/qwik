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
export const QSlotRef = 'q:sref';
export const QSlotS = 'q:s';
export const QStyle = 'q:style';
export const QScopedStyle = 'q:sstyle';
export const QCtxAttr = 'q:ctx';
export const QManifestHash = 'q:manifest-hash';
export const QInstance = 'q:instance';
export const QFuncsPrefix = 'qFuncs_';

export const getQFuncs = (document: Document, hash: string): Function[] => {
  return (document as any)[QFuncsPrefix + hash] || [];
};

export const QLocaleAttr = 'q:locale';
export const QContainerAttr = 'q:container';
export const QBaseAttr = 'q:base';
export const QContainerSelector = '[q\\:container]';

export const ResourceEvent = 'qResource';
export const ComputedEvent = 'qComputed';
export const RenderEvent = 'qRender';
export const TaskEvent = 'qTask';

/** `<q:slot name="...">` */
export const QSlotInertName = '\u0000';

export const ELEMENT_ID = 'q:id';
export const ELEMENT_ID_SELECTOR = '[q\\:id]';
export const ELEMENT_ID_PREFIX = '#';
export const INLINE_FN_PREFIX = '@';
