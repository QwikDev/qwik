/** QRL related utilities that you can import without importing all of Qwik. */

import { isDev } from '@qwik.dev/core/build';
import type { QRLInternal } from './qrl-class';
import type { QRL } from './qrl.public';

export const SYNC_QRL = '<sync>';

/** @internal Whether a QRL runs without loading a chunk. */
export const isSyncQrl = (value: unknown): boolean => {
  return isQrl(value) && value.$chunk$ === '';
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
  const index = symbolName.lastIndexOf('_') + 1;
  return symbolName.slice(index);
};
