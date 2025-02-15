/** QRL related utilities that you can import without importing all of Qwik. */

import { isDev } from '@qwik.dev/core/build';
import type { QRLInternal, SyncQRLInternal } from './qrl-class';
import type { QRL } from './qrl.public';

export const SYNC_QRL = '<sync>';

/** Sync QRL is a function which is serialized into `<script q:func="qwik/json">` tag. */
export const isSyncQrl = (value: any): value is SyncQRLInternal => {
  return isQrl(value) && value.$symbol$ == SYNC_QRL;
};

export const isQrl = <T = unknown>(value: unknown): value is QRLInternal<T> => {
  return typeof value === 'function' && typeof (value as any).getSymbol === 'function';
};

export function assertQrl<T>(qrl: QRL<T>): asserts qrl is QRLInternal<T> {
  if (isDev) {
    if (!isQrl(qrl)) {
      throw new Error('Not a QRL');
    }
  }
}

export const getSymbolHash = (symbolName: string) => {
  const index = symbolName.lastIndexOf('_');
  if (index > -1) {
    return symbolName.slice(index + 1);
  }
  return symbolName;
};
