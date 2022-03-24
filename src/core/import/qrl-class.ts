import { InvokeContext, newInvokeContext, tryGetInvokeContext, useInvoke } from '../use/use-core';
import type { ValueOrPromise } from '../util/types';
import { qrlImport, QRLSerializeOptions, stringifyQRL } from './qrl';
import type { QRL as IQRL } from './qrl.public';

export function isQrl(value: any): value is QRLInternal {
  return value instanceof QRLInternal;
}

class QRL<TYPE = any> implements IQRL<TYPE> {
  __brand__QRL__!: TYPE;
  canonicalChunk: string;
  private el: Element | undefined;

  constructor(
    public chunk: string,
    public symbol: string,
    public symbolRef: null | ValueOrPromise<TYPE>,
    public symbolFn: null | (() => Promise<Record<string, any>>),
    public capture: null | string[],
    public captureRef: null | any[]
  ) {
    this.canonicalChunk = chunk.replace(FIND_EXT, '');
  }

  setContainer(el: Element) {
    if (!this.el) {
      this.el = el;
    }
  }

  async resolve(el?: Element): Promise<TYPE> {
    if (el) {
      this.setContainer(el);
    }
    return qrlImport(this.el, this);
  }

  invokeFn(): (...args: any[]) => any {
    return async (...args: any[]) => {
      const currentCtx = tryGetInvokeContext();
      const fn = typeof this.symbolRef === 'function' ? this.symbolRef : await this.resolve();

      if (typeof fn === 'function') {
        const context: InvokeContext = {
          ...newInvokeContext(),
          ...currentCtx,
          qrl: this,
        };
        return useInvoke(context, fn as any, ...args);
      }
      throw new Error('QRL is not a function');
    };
  }

  copy(): QRLInternal<TYPE> {
    return new QRLInternal(
      this.chunk,
      this.symbol,
      this.symbolRef,
      this.symbolFn,
      null,
      this.captureRef
    );
  }

  async invoke<ARGS extends any[]>(
    ...args: ARGS
  ): Promise<TYPE extends (...args: any) => any ? ReturnType<TYPE> : never> {
    const fn = this.invokeFn();
    return fn(...args);
  }

  serialize(options?: QRLSerializeOptions) {
    return stringifyQRL(this, options);
  }
}

export type QRLInternal<T = any> = QRL<T>;
export const QRLInternal: typeof QRL = QRL;

// https://regexr.com/6enjv
const FIND_EXT = /\?[\w=&]+$/;
