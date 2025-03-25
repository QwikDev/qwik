import type { ClientPageData } from './types';

export const MODULE_CACHE = /*#__PURE__*/ new WeakMap<any, any>();

export const CLIENT_DATA_CACHE = new Map<string, Promise<ClientPageData | undefined>>();

export const QACTION_KEY = 'qaction';

export const QFN_KEY = 'qfunc';

export const QDATA_KEY = 'qdata';
