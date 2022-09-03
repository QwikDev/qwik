import { qError, QError_qrlIsNotFunction } from '../error/error';
import { verifySerializable } from '../object/q-object';
import { getPlatform } from '../platform/platform';
import type { QwikElement } from '../render/dom/virtual-element';
import {
  InvokeContext,
  newInvokeContext,
  invoke,
  InvokeTuple,
  newInvokeContextFromTuple,
} from '../use/use-core';
import { then } from '../util/promises';
import { qDev, seal } from '../util/qdev';
import { isArray, isFunction, ValueOrPromise } from '../util/types';
import type { QRL } from './qrl.public';

export const isQrl = (value: any): value is QRLInternal => {
  return typeof value === 'function' && typeof value.getSymbol === 'function';
};

export interface QRLInternalMethods<TYPE> {
  readonly $chunk$: string;
  readonly $symbol$: string;
  readonly $refSymbol$: string | null;
  readonly $hash$: string;

  $capture$: string[] | null;
  $captureRef$: any[] | null;

  resolve(el?: QwikElement): Promise<TYPE>;
  getSymbol(): string;
  getHash(): string;
  getFn(currentCtx?: InvokeContext | InvokeTuple, beforeFn?: () => void): any;

  $setContainer$(containerEl: Element): void;
  $resolveLazy$(): void;
}

export interface QRLInternal<TYPE = any> extends QRL<TYPE>, QRLInternalMethods<TYPE> {}

export const createQRL = <TYPE>(
  chunk: string,
  symbol: string,
  symbolRef: null | ValueOrPromise<TYPE>,
  symbolFn: null | (() => Promise<Record<string, any>>),
  capture: null | string[],
  captureRef: any[] | null,
  refSymbol: string | null
): QRLInternal<TYPE> => {
  if (qDev) {
    verifySerializable(captureRef);
  }

  let containerEl: Element | undefined;

  const setContainer = (el: Element) => {
    if (!containerEl) {
      containerEl = el;
    }
  };

  const resolve = async (): Promise<TYPE> => {
    if (symbolRef) {
      return symbolRef;
    }
    if (symbolFn) {
      return (symbolRef = symbolFn().then((module) => (symbolRef = module[symbol])));
    } else {
      if (!containerEl) {
        throw new Error(
          `QRL '${chunk}#${symbol || 'default'}' does not have an attached container`
        );
      }
      const symbol2 = getPlatform(containerEl).importSymbol(containerEl, chunk, symbol);
      return (symbolRef = then(symbol2, (ref) => {
        return (symbolRef = ref);
      }));
    }
  };

  const resolveLazy = (): ValueOrPromise<TYPE> => {
    return isFunction(symbolRef) ? symbolRef : resolve();
  };

  const invokeFn = (currentCtx?: InvokeContext | InvokeTuple, beforeFn?: () => void) => {
    return ((...args: any[]): any => {
      const fn = resolveLazy() as TYPE;
      return then(fn, (fn) => {
        if (isFunction(fn)) {
          const baseContext = createInvokationContext(currentCtx);
          const context: InvokeContext = {
            ...baseContext,
            $qrl$: QRL as QRLInternal<any>,
          };
          if (beforeFn) {
            beforeFn();
          }
          return invoke(context, fn as any, ...args);
        }
        throw qError(QError_qrlIsNotFunction);
      });
    }) as any;
  };

  const createInvokationContext = (invoke: InvokeContext | InvokeTuple | undefined) => {
    if (invoke == null) {
      return newInvokeContext();
    } else if (isArray(invoke)) {
      return newInvokeContextFromTuple(invoke);
    } else {
      return invoke;
    }
  };

  const invokeQRL = async function (...args: any) {
    const fn = invokeFn();
    const result = await fn(...args);
    return result;
  };
  const resolvedSymbol = refSymbol ?? symbol;
  const hash = getSymbolHash(resolvedSymbol);

  const QRL: QRLInternal<TYPE> = invokeQRL as any;
  const methods: QRLInternalMethods<TYPE> = {
    getSymbol: () => resolvedSymbol,
    getHash: () => hash,
    resolve,
    $resolveLazy$: resolveLazy,
    $setContainer$: setContainer,
    $chunk$: chunk,
    $symbol$: symbol,
    $refSymbol$: refSymbol,
    $hash$: hash,
    getFn: invokeFn,

    $capture$: capture,
    $captureRef$: captureRef,
  };
  const qrl = Object.assign(invokeQRL, methods);
  seal(qrl);
  return qrl as any;
};

export const getSymbolHash = (symbolName: string) => {
  const index = symbolName.lastIndexOf('_');
  if (index > -1) {
    return symbolName.slice(index + 1);
  }
  return symbolName;
};

export function assertQrl<T>(qrl: QRL<T>): asserts qrl is QRLInternal<T> {
  if (qDev) {
    if (!isQrl(qrl)) {
      throw new Error('Not a QRL');
    }
  }
}
