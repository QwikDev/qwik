import type { ValueOrPromise } from '../util/types';
import type { QRL as IQRL } from './qrl.public';

export function isQrl(value: any): value is IQRL {
  return value instanceof QRLClass;
}

export const QRLClass = class QRL<TYPE = any> implements IQRL<TYPE> {
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
};
