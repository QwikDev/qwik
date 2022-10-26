import type { MustGetObjID } from '../container/container';
import { isFunction } from '../util/types';

/**
 * @alpha
 */
export const $$ = <T extends () => any>(fn: T): T => {
  return fn;
};

const FnOriginalSymbol = Symbol('original fn');
const FnCaptureSymbol = '$$';

export interface InlinedFn<B = any> {
  (): B;
  [FnOriginalSymbol]: Function | string;
  [FnCaptureSymbol]: any[];
}

/**
 * @alpha
 */
export const _inlinedFn = <T extends (...args: any[]) => any>(fn: T, args: any[]) => {
  const bindedFn = (() => {
    return fn(...args);
  }) as InlinedFn;
  bindedFn[FnCaptureSymbol] = args;
  bindedFn[FnOriginalSymbol] = fn;

  return bindedFn;
};

export const isInlinedFn = (obj: any): obj is InlinedFn => {
  return isFunction(obj) && FnOriginalSymbol in obj;
};

export const serializeInlinedFn = (inlinedFn: InlinedFn, getObjID: MustGetObjID) => {
  const parts = inlinedFn[FnCaptureSymbol].map(getObjID);
  const originalFn = inlinedFn[FnOriginalSymbol];
  return parts.join(' ') + ':' + String(originalFn);
};

export const parseInlinedFn = (data: string) => {
  const colonIndex = data.indexOf(':');
  const objects = data.slice(0, colonIndex).split(' ');
  const fnStr = data.slice(colonIndex + 1);
  const fn = new Function('args', `return () => ((${fnStr}).apply(undefined, args));`)(objects);
  fn[FnCaptureSymbol] = objects;
  fn[FnOriginalSymbol] = fnStr;
  return fn;
};
