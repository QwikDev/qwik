import { qError, QError_qrlIsNotFunction } from '../error/error';
import { getPlatform, isServerPlatform } from '../platform/platform';
import { verifySerializable } from '../state/common';
import { isSignal, type SignalInternal } from '../state/signal';
import {
  type InvokeContext,
  newInvokeContext,
  invoke,
  type InvokeTuple,
  newInvokeContextFromTuple,
  tryGetInvokeContext,
} from '../use/use-core';
import { then } from '../util/promises';
import { qDev, qSerialize, qTest, seal } from '../util/qdev';
import { isArray, isFunction, type ValueOrPromise } from '../util/types';
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
  dev: QRLDev | null;

  resolved: undefined | TYPE;

  resolve(): Promise<TYPE>;
  getSymbol(): string;
  getHash(): string;
  getCaptured(): any[] | null;
  getFn(
    currentCtx?: InvokeContext | InvokeTuple,
    beforeFn?: () => void
  ): TYPE extends (...args: infer ARGS) => infer Return
    ? (...args: ARGS) => ValueOrPromise<Return>
    : any;

  $setContainer$(containerEl: Element | undefined): Element | undefined;
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
  if (qDev && qSerialize) {
    if (captureRef) {
      for (const item of captureRef) {
        verifySerializable(item, 'Captured variable in the closure can not be serialized');
      }
    }
  }

  let _containerEl: Element | undefined;

  const qrl = async function (this: any, ...args: any) {
    const fn = invokeFn.call(this, tryGetInvokeContext());
    const result = await fn(...args);
    return result;
  } as unknown as QRLInternal<TYPE>;

  const setContainer = (el: Element | undefined) => {
    if (!_containerEl) {
      _containerEl = el;
    }
    return _containerEl;
  };

  const resolve = async (containerEl?: Element): Promise<TYPE> => {
    if (containerEl) {
      setContainer(containerEl);
    }
    if (symbolRef !== null) {
      return symbolRef;
    }
    if (symbolFn !== null) {
      return (symbolRef = symbolFn().then((module) => (qrl.resolved = symbolRef = module[symbol])));
    } else {
      const symbol2 = getPlatform().importSymbol(_containerEl, chunk, symbol);
      return (symbolRef = then(symbol2, (ref) => {
        return (qrl.resolved = symbolRef = ref);
      }));
    }
  };

  const resolveLazy = (containerEl?: Element): ValueOrPromise<TYPE> => {
    return symbolRef !== null ? symbolRef : resolve(containerEl);
  };

  function invokeFn(
    this: any,
    currentCtx?: InvokeContext | InvokeTuple,
    beforeFn?: () => void | boolean
  ) {
    return ((...args: any[]): any => {
      const start = now();
      const fn = resolveLazy() as TYPE;
      return then(fn, (fn) => {
        if (isFunction(fn)) {
          if (beforeFn && beforeFn() === false) {
            return;
          }
          const baseContext = createOrReuseInvocationContext(currentCtx);
          const context: InvokeContext = {
            ...baseContext,
            $qrl$: qrl as QRLInternal<any>,
          };
          if (context.$event$ === undefined) {
            context.$event$ = this;
          }
          emitUsedSymbol(symbol, context.$element$, start);
          return invoke.call(this, context, fn as any, ...args);
        }
        throw qError(QError_qrlIsNotFunction);
      });
    }) as any;
  }

  const createOrReuseInvocationContext = (invoke: InvokeContext | InvokeTuple | undefined) => {
    if (invoke == null) {
      return newInvokeContext();
    } else if (isArray(invoke)) {
      return newInvokeContextFromTuple(invoke);
    } else {
      return invoke;
    }
  };

  const resolvedSymbol = refSymbol ?? symbol;
  const hash = getSymbolHash(resolvedSymbol);

  Object.assign(qrl, {
    getSymbol: () => resolvedSymbol,
    getHash: () => hash,
    getCaptured: () => captureRef,
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
    dev: null,
    resolved: undefined,
  });
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

export function assertSignal<T>(obj: any): asserts obj is SignalInternal<T> {
  if (qDev) {
    if (!isSignal(obj)) {
      throw new Error('Not a Signal');
    }
  }
}

const EMITTED = /*#__PURE__*/ new Set();

export const emitUsedSymbol = (symbol: string, element: Element | undefined, reqTime: number) => {
  if (!EMITTED.has(symbol)) {
    EMITTED.add(symbol);
    emitEvent('qsymbol', {
      symbol,
      element,
      reqTime,
    });
  }
};

export const emitEvent = (eventName: string, detail: any) => {
  if (!qTest && !isServerPlatform() && typeof document === 'object') {
    document.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: false,
        detail,
      })
    );
  }
};

const now = () => {
  if (qTest || isServerPlatform()) {
    return 0;
  }
  if (typeof performance === 'object') {
    return performance.now();
  }
  return 0;
};
