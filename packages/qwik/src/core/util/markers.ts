import { QContainerValue } from '../v2/shared/types';

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
export const QSubscribers = 'q:subs';
export const QManifestHash = 'q:manifest-hash';
export const QFuncsPrefix = 'qFuncs_';

export const getQFuncs = (
  document: Document,
  hash: string
): Array<(...args: unknown[]) => unknown> => {
  return (document as any)[QFuncsPrefix + hash] || [];
};

export const QRenderAttr = 'q:render';
export const QRuntimeAttr = 'q:runtime';
export const QVersionAttr = 'q:version';
export const QBaseAttr = 'q:base';
export const QLocaleAttr = 'q:locale';
export const QManifestHashAttr = 'q:manifest-hash';
export const QInstanceAttr = 'q:instance';
export const QContainerIsland = 'q:container-island';
export const QContainerIslandEnd = '/' + QContainerIsland;
export const QIgnore = 'q:ignore';
export const QIgnoreEnd = '/' + QIgnore;
export const QContainerAttr = 'q:container';
export const QContainerAttrEnd = '/' + QContainerAttr;
export const QShadowRoot = 'q:shadowroot';

export const QTemplate = 'q:template';

// the same selector should be inside the qwik loader
// and the same selector should be inside the qwik city spa-shim and spa-init
export const QContainerSelector =
  '[q\\:container]:not([q\\:container=' +
  QContainerValue.HTML +
  ']):not([q\\:container=' +
  QContainerValue.TEXT +
  '])';

export const HTML_NS = 'http://www.w3.org/1999/xhtml';
export const SVG_NS = 'http://www.w3.org/2000/svg';
export const MATH_NS = 'http://www.w3.org/1998/Math/MathML';

export const ResourceEvent = 'qResource';
export const ComputedEvent = 'qComputed';
export const RenderEvent = 'qRender';
export const TaskEvent = 'qTask';

/** `<q:slot name="...">` */
export const QSlotInertName = '\u0000';
export const QDefaultSlot = '';

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
export const ELEMENT_SEQ_IDX = 'q:seqIdx';
export const ELEMENT_SELF_ID = -1;
export const ELEMENT_ID_SELECTOR = '[q\\:id]';
export const ELEMENT_ID_PREFIX = '#';
export const INLINE_FN_PREFIX = '@';

/** Non serializable markers - always begins with `:` character */
export const NON_SERIALIZABLE_MARKER_PREFIX = ':';
export const USE_ON_LOCAL = NON_SERIALIZABLE_MARKER_PREFIX + 'on';
export const USE_ON_LOCAL_SEQ_IDX = NON_SERIALIZABLE_MARKER_PREFIX + 'onIdx';
export const USE_ON_LOCAL_FLAGS = NON_SERIALIZABLE_MARKER_PREFIX + 'onFlags';

// comment nodes
export const FLUSH_COMMENT = 'qkssr-f';
export const STREAM_BLOCK_START_COMMENT = 'qkssr-pu';
export const STREAM_BLOCK_END_COMMENT = 'qkssr-po';

export const Q_PROPS_SEPARATOR = ':';
