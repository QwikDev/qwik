import {
  qError,
  QError_qrlIsNotFunction,
  QError_qrlMissingChunk,
  QError_qrlMissingContainer,
} from '../error/error';
import { getPlatform, isServer } from '../platform/platform';
import { verifySerializable } from '../state/common';
import {
  InvokeContext,
  newInvokeContext,
  invoke,
  InvokeTuple,
  newInvokeContextFromTuple,
} from '../use/use-core';
import { then } from '../util/promises';
import { qDev, qTest, seal } from '../util/qdev';
import { isArray, isFunction, ValueOrPromise } from '../util/types';
import type { QRLDev } from './qrl';
import type { QRL } from './qrl.public';

export const isQrl = (value: any): value is QRLInternal => {
  return typeof value === 'function' && typeof value.getSymbol === 'function';
};

export interface QRLInternalMethods<TYPE> {
  readonly $chunk$: string | null;
  readonly $symbol$: string;
  readonly $refSymbol$: string | null;
  readonly $hash$: string;

  $capture$: string[] | null;
  $captureRef$: any[] | null;
  $dev$: QRLDev | null;

  resolve(): Promise<TYPE>;
  getSymbol(): string;
  getHash(): string;
  getFn(
    currentCtx?: InvokeContext | InvokeTuple,
    beforeFn?: () => void
  ): TYPE extends (...args: infer ARGS) => infer Return
    ? (...args: ARGS) => ValueOrPromise<Return>
    : any;

  $setContainer$(containerEl: Element | undefined): void;
  $resolveLazy$(containerEl?: Element): ValueOrPromise<TYPE>;
}

export interface QRLInternal<TYPE = any> extends QRL<TYPE>, QRLInternalMethods<TYPE> {}

export const createQRL = <TYPE>(
  chunk: string | null,
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

  let _containerEl: Element | undefined;

  const setContainer = (el: Element | undefined) => {
    if (!_containerEl) {
      _containerEl = el;
    }
  };

  const resolve = async (containerEl?: Element): Promise<TYPE> => {
    if (containerEl) {
      setContainer(containerEl);
    }
    if (symbolRef !== null) {
      return symbolRef;
    }
    if (symbolFn !== null) {
      return (symbolRef = symbolFn().then((module) => (symbolRef = module[symbol])));
    } else {
      if (!chunk) {
        throw qError(QError_qrlMissingChunk, symbol);
      }
      if (!_containerEl) {
        throw qError(QError_qrlMissingContainer, chunk, symbol);
      }
      const symbol2 = getPlatform().importSymbol(_containerEl, chunk, symbol);
      return (symbolRef = then(symbol2, (ref) => {
        return (symbolRef = ref);
      }));
    }
  };

  const resolveLazy = (containerEl?: Element): ValueOrPromise<TYPE> => {
    return symbolRef !== null ? symbolRef : resolve(containerEl);
  };

  const invokeFn = (currentCtx?: InvokeContext | InvokeTuple, beforeFn?: () => void | boolean) => {
    return ((...args: any[]): any => {
      const start = now();
      const fn = resolveLazy() as TYPE;
      return then(fn, (fn) => {
        if (isFunction(fn)) {
          if (beforeFn && beforeFn() === false) {
            return;
          }
          const baseContext = createInvokationContext(currentCtx);
          const context: InvokeContext = {
            ...baseContext,
            $qrl$: QRL as QRLInternal<any>,
          };
          emitUsedSymbol(symbol, context.$element$, start);
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
    $dev$: null,
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

export const emitUsedSymbol = (symbol: string, element: Element | undefined, reqTime: number) => {
  emitEvent('qsymbol', {
    symbol,
    element,
    reqTime,
  });
};

export const emitEvent = (eventName: string, detail: any) => {
  if (!qTest && !isServer() && typeof document === 'object') {
    document.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: false,
        detail,
      })
    );
  }
};

const now = () => {
  if (qTest || isServer()) {
    return 0;
  }
  if (typeof performance === 'object') {
    return performance.now();
  }
  return 0;
};
