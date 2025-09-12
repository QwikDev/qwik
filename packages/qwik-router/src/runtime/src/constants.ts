import type { ClientPageData } from './types';
import type { SerializationStrategy } from '@qwik.dev/core/internal';

export const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const CLIENT_DATA_CACHE = new Map<string, Promise<ClientPageData | undefined>>();

export const QACTION_KEY = 'qaction';

export const QLOADER_KEY = 'qloaders';

export const QFN_KEY = 'qfunc';

export const QDATA_KEY = 'qdata';
/** @public */
export const Q_ROUTE = 'q:route';

export const DEFAULT_LOADERS_SERIALIZATION_STRATEGY: SerializationStrategy =
  globalThis.__DEFAULT_LOADERS_SERIALIZATION_STRATEGY__ || 'never';
