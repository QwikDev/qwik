/* eslint-disable @typescript-eslint/no-restricted-imports */
/**
 * @file
 *
 *   Importing directly from `qwik` is not allowed because the SSR package would end up with two
 *   copies of the code. Instead, the SSR package should import from `@qwikdev/core`.
 *
 *   The exception to this rule is importing types, because those get elided by TypeScript. To make
 *   ensuring that this rule is followed, this file is the only place where relative `../` imports
 *   of types only are allowed.
 *
 *   Sum code we are OK by importing and making a copy because it will have no adverse affect. This
 *   file lists code which we are OK to have duplicated.
 */

export { mapApp_remove, mapArray_get, mapArray_set } from '../core/client/vnode';
export { DEBUG_TYPE, QContainerValue, VirtualType } from '../core/shared/types';
export { escapeHTML } from '../core/shared/utils/character-escaping';
export {
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  ELEMENT_SEQ_IDX,
  FLUSH_COMMENT,
  NON_SERIALIZABLE_MARKER_PREFIX,
  OnRenderProp,
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
  QSlotRef,
  QStyle,
  QTemplate,
  QVersionAttr,
  Q_PROPS_SEPARATOR,
  STREAM_BLOCK_END_COMMENT,
  STREAM_BLOCK_START_COMMENT,
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
export { getValidManifest } from '../optimizer/src/manifest';
