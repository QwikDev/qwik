import { qError, QError_qrlIsNotFunction } from '../error/error';
import { verifySerializable } from '../object/q-object';
import { getPlatform } from '../platform/platform';
import { InvokeContext, newInvokeContext, useInvoke } from '../use/use-core';
import { then } from '../util/promises';
import { qDev } from '../util/qdev';
import { isFunction, ValueOrPromise } from '../util/types';
import { QRLSerializeOptions, stringifyQRL } from './qrl';
import type { QRL } from './qrl.public';

export const isQrl = (value: any): value is QRLInternal => {
  return typeof value === 'function' && typeof value.getSymbol === 'function';
};

export interface QRLInternalMethods<TYPE> {
  readonly $chunk$: string;
  readonly $symbol$: string;
  readonly $refSymbol$: string | null;
  $capture$: string[] | null;
  $captureRef$: any[] | null;

  resolve(el?: Element): Promise<TYPE>;
  getSymbol(): string;
  getHash(): string;

  $setContainer$(el: Element): void;
  $resolveLazy$(el: Element): void;
  $invokeFn$(el?: Element, currentCtx?: InvokeContext, beforeFn?: () => void): any;
  $copy$(): QRLInternal<TYPE>;
  $serialize$(options?: QRLSerializeOptions): string;
}

export interface QRLInternal<TYPE = any> extends QRL<TYPE>, QRLInternalMethods<TYPE> {}

export const createQrl = <TYPE>(
  chunk: string,
  symbol: string,
  symbolRef: null | ValueOrPromise<TYPE>,
  symbolFn: null | (() => Promise<Record<string, any>>),
  capture: null | string[],
  captureRef: any[] | null,
  refSymbol: string | null
) => {
  if (qDev) {
    verifySerializable(captureRef);
  }

  let cachedEl: Element | undefined;

  const setContainer = (el: Element) => {
    if (!cachedEl) {
      cachedEl = el;
    }
  };

  const resolve = async (el?: Element): Promise<TYPE> => {
    if (el) {
      setContainer(el);
    }
    if (symbolRef) {
      return symbolRef;
    }
    if (symbolFn) {
      return (symbolRef = symbolFn().then((module) => (symbolRef = module[symbol])));
    } else {
      if (!cachedEl) {
        throw new Error(
          `QRL '${chunk}#${symbol || 'default'}' does not have an attached container`
        );
      }
      const symbol2 = getPlatform(cachedEl).importSymbol(cachedEl, chunk, symbol);
      return (symbolRef = then(symbol2, (ref) => {
        return (symbolRef = ref);
      }));
    }
  };

  const resolveLazy = (el?: Element): ValueOrPromise<TYPE> => {
    return isFunction(symbolRef) ? symbolRef : resolve(el);
  };

  const invokeFn = (el?: Element, currentCtx?: InvokeContext, beforeFn?: () => void) => {
    return ((...args: any[]): any => {
      const fn = resolveLazy(el) as TYPE;
      return then(fn, (fn) => {
        if (isFunction(fn)) {
          const baseContext = currentCtx ?? newInvokeContext();
          const context: InvokeContext = {
            ...baseContext,
            $qrl$: QRL as QRLInternal<any>,
          };
          if (beforeFn) {
            beforeFn();
          }
          return useInvoke(context, fn as any, ...args);
        }
        throw qError(QError_qrlIsNotFunction);
      });
    }) as any;
  };

  const invoke = async function (...args: any) {
    const fn = invokeFn();
    const result = await fn(...args);
    return result;
  };

  const QRL: QRLInternal<TYPE> = invoke as any;
  const methods: QRLInternalMethods<TYPE> = {
    getSymbol: () => refSymbol ?? symbol,
    getHash: () => getSymbolHash(refSymbol ?? symbol),
    resolve,
    $resolveLazy$: resolveLazy,
    $setContainer$: setContainer,
    $chunk$: chunk,
    $symbol$: symbol,
    $refSymbol$: refSymbol,
    get $capture$() {
      return capture;
    },
    set $capture$(v) {
      capture = v;
    },
    get $captureRef$() {
      return captureRef;
    },
    set $captureRef$(v) {
      captureRef = v;
    },
    $invokeFn$: invokeFn,
    $copy$(): QRLInternal<TYPE> {
      return createQrl<TYPE>(chunk, symbol, symbolRef, symbolFn, null, captureRef, refSymbol);
    },
    $serialize$(options?: QRLSerializeOptions) {
      return stringifyQRL(QRL, options);
    },
  };
  return Object.assign(invoke, methods);
};

export const getSymbolHash = (symbolName: string) => {
  const index = symbolName.lastIndexOf('_');
  if (index > -1) {
    return symbolName.slice(index + 1);
  }
  return symbolName;
};

export const isSameQRL = (a: QRLInternal<any>, b: QRLInternal<any>): boolean => {
  return a.getHash() === b.getHash();
};

export function assertQrl<T>(qrl: QRL<T>): asserts qrl is QRLInternal<T> {
  if (qDev) {
    if (!isQrl(qrl)) {
      throw new Error('Not a QRL');
    }
  }
}
