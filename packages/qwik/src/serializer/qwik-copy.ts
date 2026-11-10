/**
 * @file
 *
 *   The serializer imports runtime values from `@qwik.dev/core` so it shares core's classes and
 *   flyweights. This file lists the core code that is OK to copy into the serializer bundle
 *   instead: const enums and helpers without identity.
 */

export { EffectKind } from '../core/dom/effect/effect-kind.enum';
export { EffectTargetKind } from '../core/dom/effect/ssr-effect';
export { IndexMode } from '../core/dom/for/for';
export { ComputedFlags, OwnerFlags, SubscriberFlags } from '../core/reactive/flags';
export { Phase } from '../core/runtime/scheduler';
export { qError, QError } from '../core/shared/error/error';
export { isQrl } from '../core/shared/qrl/qrl-utils';
export { Constants } from '../core/shared/serdes/constants';
export { TypeIds } from '../core/shared/serdes/type-id';
export {
  BRACKET_CLOSE,
  BRACKET_OPEN,
  CLOSE_TAG,
  COMMA,
  ESCAPED_CLOSE_TAG,
  QUOTE,
} from '../core/shared/ssr-const';
export { Brand, brandClass } from '../core/shared/utils/brand';
export { isPromise, maybeThen, thenInLifetime } from '../core/shared/utils/promises';
