import type { SerializationStrategy } from '@qwik.dev/core/internal';

export const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const QACTION_KEY = 'qaction';

export const QLOADER_KEY = 'qloaders';

export const QFN_KEY = 'qfunc';

export const QDATA_KEY = 'qdata';
/** @public */
export const Q_ROUTE = 'q:route';

// Hoisted function, not a const: a bundle may evaluate the app's route modules
// (which call `routeLoaderQrl` at their own eval) before this module's consts.
export function DEFAULT_LOADERS_SERIALIZATION_STRATEGY(): SerializationStrategy {
  return globalThis.__DEFAULT_LOADERS_SERIALIZATION_STRATEGY__ || 'never';
}
