import { qError, QError_qrlIsNotFunction } from '../error/error';
import { InvokeContext, newInvokeContext, useInvoke } from '../use/use-core';
import { then } from '../util/promises';
import { isFunction, ValueOrPromise } from '../util/types';
import { qrlImport, QRLSerializeOptions, stringifyQRL } from './qrl';
import type { QRL as IQRL } from './qrl.public';

export const isQrl = (value: any): value is QRL => {
  return value instanceof QRL;
};

class QRL<TYPE = any> implements IQRL<TYPE> {
  __brand__QRL__!: TYPE;
  $refSymbol$?: string;

  private $el$: Element | undefined;

  constructor(
    public $chunk$: string,
    public $symbol$: string,
    public $symbolRef$: null | ValueOrPromise<TYPE>,
    public $symbolFn$: null | (() => Promise<Record<string, any>>),
    public $capture$: null | string[],
    public $captureRef$: null | any[]
  ) {}

  setContainer(el: Element) {
    if (!this.$el$) {
      this.$el$ = el;
    }
  }

  getSymbol(): string {
    return this.$refSymbol$ ?? this.$symbol$;
  }

  getHash(): string {
    return getSymbolHash(this.$refSymbol$ ?? this.$symbol$);
  }

  async resolve(el?: Element): Promise<TYPE> {
    if (el) {
      this.setContainer(el);
    }
    return qrlImport(this.$el$, this as any);
  }

  resolveLazy(el?: Element): ValueOrPromise<TYPE> {
    return isFunction(this.$symbolRef$) ? this.$symbolRef$ : this.resolve(el);
  }

  invokeFn(el?: Element, currentCtx?: InvokeContext, beforeFn?: () => void): any {
    return ((...args: any[]): any => {
      const fn = this.resolveLazy(el) as TYPE;
      return then(fn, (fn) => {
        if (isFunction(fn)) {
          const baseContext = currentCtx ?? newInvokeContext();
          const context: InvokeContext = {
            ...baseContext,
            $qrl$: this,
          };
          if (beforeFn) {
            beforeFn();
          }
          return useInvoke(context, fn as any, ...args);
        }
        throw qError(QError_qrlIsNotFunction);
      });
    }) as any;
  }

  copy(): QRL<TYPE> {
    const copy = new QRL(
      this.$chunk$,
      this.$symbol$,
      this.$symbolRef$,
      this.$symbolFn$,
      null,
      this.$captureRef$
    );
    copy.$refSymbol$ = this.$refSymbol$;
    return copy;
  }

  async invoke(...args: TYPE extends (...args: infer ARGS) => any ? ARGS : never) {
    const fn = this.invokeFn();
    const result = await fn(...args);
    return result;
  }

  serialize(options?: QRLSerializeOptions) {
    return stringifyQRL(this, options);
  }
}

export const getSymbolHash = (symbolName: string) => {
  const index = symbolName.lastIndexOf('_');
  if (index > -1) {
    return symbolName.slice(index + 1);
  }
  return symbolName;
};

export const isSameQRL = (a: QRL<any>, b: QRL<any>): boolean => {
  return a.getHash() === b.getHash();
};

export { QRL as QRLInternal };
