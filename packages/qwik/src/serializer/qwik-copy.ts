/**
 * @file
 *
 *   Core modules the serializer imports directly. Core's build bundles the serializer as an entry, so
 *   these resolve to core's own modules, the same ones `@qwik.dev/core/internal` exports.
 */

export {
  AsyncSignalFlags,
  ComputedSignalFlags,
  EffectProperty,
  SerializationSignalFlags,
} from '../core/reactive-primitives/types';
export { qError, QError } from '../core/shared/error/error';
export { isQrl } from '../core/shared/qrl/qrl-utils';
export { Constants, TypeIds } from '../core/shared/serdes/constants';
export {
  BRACKET_CLOSE,
  BRACKET_OPEN,
  CLOSE_TAG,
  COMMA,
  ESCAPED_CLOSE_TAG,
  QUOTE,
} from '../core/shared/ssr-const';
export { Brand, brandClass } from '../core/shared/utils/brand';
export { _OWNER, _PROPS_HANDLER, _UNINITIALIZED } from '../core/shared/utils/constants';
export { ELEMENT_ID, ELEMENT_PROPS, OnRenderProp, QBackRefs } from '../core/shared/utils/markers';
export { isObjectEmpty } from '../core/shared/utils/objects';
export { isPromise, maybeThen } from '../core/shared/utils/promises';
export { createStringStreamWriter } from '../core/ssr/stream-writer';
export { VNodeDataFlag } from '../server/types';
