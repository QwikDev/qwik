/**
 * @file
 *
 *   Importing directly from `qwik` is not allowed because the SSR package would end up with two
 *   copies of the code. Instead, the SSR package should import from `@qwik.dev/core`.
 *
 *   The exception to this rule is importing types, because those get elided by TypeScript. To make
 *   ensuring that this rule is followed, this file is the only place where relative `../` imports
 *   of types only are allowed.
 *
 *   Some code is OK to import and make a copy of because it will have no adverse affect. This file
 *   lists code which we are OK to have duplicated.
 */

export {
  mapApp_remove,
  mapArray_get,
  mapArray_set,
  mapArray_has,
} from '../core/client/util-mapArray';
export { QError, qError } from '../core/shared/error/error';
export { SYNC_QRL } from '../core/shared/qrl/qrl-utils';
export { DEBUG_TYPE, QContainerValue, VirtualType } from '../core/shared/types';
export { escapeHTML, encodeVNodeDataString } from '../core/shared/utils/character-escaping';
export {
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  ELEMENT_SEQ_IDX,
  NON_SERIALIZABLE_MARKER_PREFIX,
  OnRenderProp,
  QBackRefs,
  QBaseAttr,
  QContainerAttr,
  QCtxAttr,
  QDefaultSlot,
  QInstanceAttr,
  QLocaleAttr,
  QManifestHashAttr,
  QRenderAttr,
  QRuntimeAttr,
  QScopedStyle,
  QSlot,
  QSlotParent,
  QStyle,
  QTemplate,
  QVersionAttr,
  Q_PROPS_SEPARATOR,
  ELEMENT_BACKPATCH_DATA,
  dangerouslySetInnerHTML,
} from '../core/shared/utils/markers';
export { maybeThen } from '../core/shared/utils/promises';
export {
  convertStyleIdsToString,
  getScopedStyleIdsAsPrefix,
  isClassAttr,
} from '../core/shared/utils/scoped-styles';
export { serializeAttribute } from '../core/shared/utils/styles';
export { VNodeDataChar, VNodeDataSeparator } from '../core/shared/vnode-data-types';
export { getQueue, preload, resetQueue } from '../core/preloader/queue';
export { initPreloader } from '../core/preloader/bundle-graph';
export { SsrNodeFlags } from '../core/shared/types';
export { isPromise, retryOnPromise } from '../core/shared/utils/promises';
export { ChoreBits } from '../core/shared/vnode/enums/chore-bits.enum';
export { isHtmlAttributeAnEventName, isPreventDefault } from '../core/shared/utils/event-names';
export { ITERATION_ITEM_SINGLE, ITERATION_ITEM_MULTI } from '../core/shared/utils/markers';
export { isObjectEmpty } from '../core/shared/utils/objects';
export {
  LT,
  GT,
  CLOSE_TAG,
  ESCAPED_CLOSE_TAG,
  SPACE,
  ATTR_EQUALS_QUOTE,
  QUOTE,
  EMPTY_ATTR,
  BRACKET_OPEN,
  BRACKET_CLOSE,
  PAREN_CLOSE,
  COMMA,
} from '../core/shared/ssr-const';
