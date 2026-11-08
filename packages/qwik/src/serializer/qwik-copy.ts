/**
 * @file
 *
 *   The serializer imports runtime values from `@qwik.dev/core/internal` so it shares core's classes
 *   and flyweights. This file lists the core code that is OK to copy into the serializer bundle
 *   instead: const enums and helpers without identity.
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
