import type { MustGetObjID } from '../container/container';

/**
 * @alpha
 */
export const $$ = <T>(fn: () => T): { value: T } => {
  return {
    get value() {
      return fn();
    },
  };
};

const FnOriginalSymbol = Symbol('original fn');
const FnCaptureSymbol = '$$';

export interface InlinedFn<B = any> {
  (): B;
  [FnOriginalSymbol]: Function | string;
  [FnCaptureSymbol]: any[];
}

export class SignalDerived<T = any, ARGS extends any[] = any> {
  constructor(public func: (...args: ARGS) => T, public args: ARGS) {}

  get value(): T {
    return this.func.apply(undefined, this.args);
  }
}

/**
 * @alpha
 */
export const _inlinedFn = <T extends (...args: any[]) => any>(fn: T, args: any[]) => {
  return new SignalDerived(fn, args);
};

export const serializeInlinedFn = (inlinedFn: SignalDerived, getObjID: MustGetObjID) => {
  const parts = inlinedFn.args.map(getObjID);
  const fn = String(inlinedFn.func);
  const start = fn.indexOf('=>');
  const fnBody = fn.slice(start + 2).trim();
  return parts.join(' ') + ':' + fnBody;
};

export const parseInlinedFn = (data: string) => {
  const colonIndex = data.indexOf(':');
  const objects = data.slice(0, colonIndex).split(' ');
  const fnStr = data.slice(colonIndex + 1);
  const args = objects.map((_, i) => `p${i}`);
  args.push(`return ${fnStr}`);
  const fn = new Function(...args);
  return new SignalDerived(fn as any, objects);
};
