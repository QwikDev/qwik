import { InvokeContext, newInvokeContext, useInvoke } from '../use/use-core';
import { then } from '../util/promises';
import type { ValueOrPromise } from '../util/types';
import { qrlImport, QRLSerializeOptions, stringifyQRL } from './qrl';
import type { QRL as IQRL } from './qrl.public';

export function isQrl(value: any): value is QRLInternal {
  return value instanceof QRLInternal;
}

class QRL<TYPE = any> implements IQRL<TYPE> {
  __brand__QRL__!: TYPE;
  refSymbol?: string;

  private el: Element | undefined;

  constructor(
    public chunk: string,
    public symbol: string,
    public symbolRef: null | ValueOrPromise<TYPE>,
    public symbolFn: null | (() => Promise<Record<string, any>>),
    public capture: null | string[],
    public captureRef: null | any[]
  ) {}

  setContainer(el: Element) {
    if (!this.el) {
      this.el = el;
    }
  }

  async resolve(el?: Element): Promise<TYPE> {
    if (el) {
      this.setContainer(el);
    }
    return qrlImport(this.el, this as any);
  }

  invokeFn(el?: Element, currentCtx?: InvokeContext, beforeFn?: () => void): any {
    return ((...args: any[]): any => {
      const fn = (typeof this.symbolRef === 'function' ? this.symbolRef : this.resolve(el)) as TYPE;
      return then(fn, (fn) => {
        if (typeof fn === 'function') {
          const baseContext = currentCtx ?? newInvokeContext();
          const context: InvokeContext = {
            ...baseContext,
            qrl: this,
          };
          if (beforeFn) {
            beforeFn();
          }
          return useInvoke(context, fn as any, ...args);
        }
        throw new Error('QRL is not a function');
      });
    }) as any;
  }

  copy(): QRLInternal<TYPE> {
    const copy = new QRLInternal(
      this.chunk,
      this.symbol,
      this.symbolRef,
      this.symbolFn,
      null,
      this.captureRef
    );
    copy.refSymbol = this.refSymbol;
    return copy;
  }

  invoke(...args: TYPE extends (...args: infer ARGS) => any ? ARGS : never) {
    const fn = this.invokeFn();
    return fn(...args) as any;
  }

  serialize(options?: QRLSerializeOptions) {
    return stringifyQRL(this, options);
  }
}

export const getCanonicalSymbol = (symbolName: string) => {
  const index = symbolName.lastIndexOf('_');
  if (index > -1) {
    return symbolName.slice(index + 1);
  }
  return symbolName;
};

export const isSameQRL = (a: QRL<any>, b: QRL<any>): boolean => {
  return getCanonicalSymbol(a.symbol) === getCanonicalSymbol(b.symbol);
};

export type QRLInternal<T = any> = QRL<T>;
export const QRLInternal: typeof QRL = QRL;

// https://regexr.com/6enjv
const FIND_EXT = /\?[\w=&]+$/;
