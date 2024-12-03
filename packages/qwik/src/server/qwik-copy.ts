/* eslint-disable @typescript-eslint/no-restricted-imports */
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
 *   lists code which we are OK to have duplicated, so we don't export more internals from core.
 */

export { serializeAttribute } from '../core/shared/utils/styles';
export { dangerouslySetInnerHTML } from '../core/shared/utils/markers';
export {
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  ELEMENT_SEQ_IDX,
  OnRenderProp,
  QContainerAttr,
  QCtxAttr,
  QScopedStyle,
  QSlot,
  QSlotParent,
  QSlotRef,
  QStyle,
  QTemplate,
  QRenderAttr,
  QRuntimeAttr,
  QVersionAttr,
  QBaseAttr,
  QLocaleAttr,
  QManifestHashAttr,
  QInstanceAttr,
  FLUSH_COMMENT,
  STREAM_BLOCK_END_COMMENT,
  STREAM_BLOCK_START_COMMENT,
  QDefaultSlot,
  Q_PROPS_SEPARATOR,
  NON_SERIALIZABLE_MARKER_PREFIX,
} from '../core/shared/utils/markers';
export { maybeThen } from '../core/shared/utils/promises';
export { mapApp_remove, mapArray_get, mapArray_set } from '../core/client/mapArray';
export {
  convertStyleIdsToString,
  getScopedStyleIdsAsPrefix,
  isClassAttr,
} from '../core/shared/utils/scoped-styles';
export { DEBUG_TYPE, VirtualType, QContainerValue } from '../core/shared/types';
export { VNodeDataChar, VNodeDataSeparator } from '../core/shared/vnode-data-types';
export { escapeHTML } from '../core/shared/utils/character-escaping';
export { getValidManifest } from '../optimizer/src/manifest';
export { SYNC_QRL } from '../core/shared/qrl/qrl-utils';
