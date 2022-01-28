import type { ValueOrPromise } from '../util/types';
import { runtimeQrl, staticQrl } from './qrl';

/**
 * @public
 */
export interface QRL<TYPE = any> {
  chunk: string;
  symbol: string;
  symbolRef: null | ValueOrPromise<TYPE>;
  symbolFn: null | (() => Promise<Record<string, any>>);
  capture: null | (boolean | number | null | undefined | string)[];
  captureRef: null | any[];
  guard: null | Map<string, string[]>;
  guardRef: null | WeakMap<Object, string[]>;
}

/**
 * @public
 */
export function $<T>(value: T): QRL<T> {
  return runtimeQrl(value);
}

/**
 * @public
 */
export function implicit$FirstArg<FIRST, REST extends any[], RET>(
  fn: (first: QRL<FIRST>, ...rest: REST) => RET
): (first: FIRST, ...rest: REST) => RET {
  return function (first: FIRST, ...rest: REST): RET {
    return fn.call(null, $(first), ...rest);
  };
}

/**
 * @public
 */
export const qrl: <T = any>(
  chunkOrFn: string | (() => Promise<any>),
  symbol: string,
  lexicalScopeCapture?: any[]
) => QRL<T> = staticQrl;
