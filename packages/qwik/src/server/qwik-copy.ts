/**
 * Stateless core primitives that are safe to duplicate in the server bundle.
 *
 * Stateful runtime values must be imported from `@qwik.dev/core` so SSR and compiled components
 * operate on the same Signals, QRLs, owners and serialization context.
 */
export { QError, qError } from '../core/shared/error/error';
export { OwnerFlags, SubscriberFlags } from '../core/reactive/flags';
export { SubscriberKind } from '../core/runtime/subscriber';
export { SYNC_QRL } from '../core/shared/qrl/qrl-utils';
export { QContainerValue } from '../core/shared/types';
export { escapeHTML } from '../core/shared/utils/character-escaping';
export {
  EventNameHtmlScope,
  getEventDataFromHtmlAttribute,
  getScopedEventName,
} from '../core/shared/utils/event-names';
export {
  QBaseAttr,
  QContainerAttr,
  QInstanceAttr,
  QLocaleAttr,
  QManifestHashAttr,
  QRenderAttr,
  QRuntimeAttr,
  QVersionAttr,
} from '../core/shared/utils/markers';
export { TypeIds } from '../core/shared/serdes/type-id';
export type { CorePlatformServer } from '../core/shared/platform/types';
export type { ValueOrPromise } from '../core/shared/utils/types';
