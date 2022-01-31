import type { ValueOrPromise } from '../util/types';
import type { QRL as IQRL } from './qrl.public';

export function isQrl(value: any): value is QRLInternal {
  return value instanceof QRLInternal;
}

class QRL<TYPE = any> implements IQRL<TYPE> {
  __brand__QRL__!: TYPE;
  constructor(
    public chunk: string,
    public symbol: string,
    public symbolRef: null | ValueOrPromise<TYPE>,
    public symbolFn: null | (() => Promise<Record<string, any>>),
    public capture: null | (boolean | number | null | undefined | string)[],
    public captureRef: null | any[],
    public guard: null | Map<string, string[]>,
    public guardRef: null | WeakMap<Object, string[]>
  ) {}
}

export type QRLInternal<T = any> = QRL<T>;
export const QRLInternal: typeof QRL = QRL;
