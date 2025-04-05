import { assertDefined } from '../error/assert';
import { qError, QError_qrlIsNotFunction } from '../error/error';
import { getPlatform, isServerPlatform } from '../platform/platform';
import { verifySerializable } from '../state/common';
import { isSignal, type SignalInternal } from '../state/signal';
import {
  invoke,
  newInvokeContext,
  newInvokeContextFromTuple,
  tryGetInvokeContext,
  type InvokeContext,
  type InvokeTuple,
} from '../use/use-core';
import { getQFuncs, QInstance } from '../util/markers';
import { isPromise, maybeThen } from '../util/promises';
import { qDev, qSerialize, qTest, seal } from '../util/qdev';
import { isArray, isFunction, type ValueOrPromise } from '../util/types';
// @ts-expect-error we don't have types for the preloader
import { p as preload } from '@builder.io/qwik/preloader';
import type { QRLDev } from './qrl';
import type { QRL, QrlArgs, QrlReturn } from './qrl.public';
import { isBrowser } from '@builder.io/qwik/build';

export const isQrl = <T = unknown>(value: unknown): value is QRLInternal<T> => {
  return typeof value === 'function' && typeof (value as any).getSymbol === 'function';
};

// Make sure this value is same as value in `platform.ts`
export const SYNC_QRL = '<sync>';

/** Sync QRL is a function which is serialized into `<script q:func="qwik/json">` tag. */
export const isSyncQrl = (value: any): value is QRLInternal => {
  return isQrl(value) && value.$symbol$ == SYNC_QRL;
};

export type QRLInternalMethods<TYPE> = {
  readonly $chunk$: string | null;
  readonly $symbol$: string;
  readonly $refSymbol$: string | null;
  readonly $hash$: string;

  $capture$: string[] | null;
  $captureRef$: unknown[] | null;
  dev: QRLDev | null;

  resolved: undefined | TYPE;

  resolve(): Promise<TYPE>;
  getSymbol(): string;
  getHash(): string;
  getCaptured(): unknown[] | null;
  getFn(
    currentCtx?: InvokeContext | InvokeTuple,
    beforeFn?: () => void
  ): TYPE extends (...args: any) => any
    ? (...args: Parameters<TYPE>) => ValueOrPromise<ReturnType<TYPE>>
    : // unknown so we allow assigning function QRLs to any
      unknown;

  $setContainer$(containerEl: Element | undefined): Element | undefined;
  $resolveLazy$(containerEl: Element): ValueOrPromise<TYPE>;
};

export type QRLInternal<TYPE = unknown> = QRL<TYPE> & QRLInternalMethods<TYPE>;

export const createQRL = <TYPE>(
  chunk: string | null,
  symbol: string,
  symbolRef: null | ValueOrPromise<TYPE>,
  symbolFn: null | (() => Promise<Record<string, TYPE>>),
  capture: null | Readonly<string[]>,
  captureRef: Readonly<unknown[]> | null,
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

  const qrl = async function (this: unknown, ...args: QrlArgs<TYPE>) {
    const fn = invokeFn.call(this, tryGetInvokeContext());
    const result = await fn(...args);
    return result;
  } as QRLInternal<TYPE>;

  const setContainer = (el: Element | undefined) => {
    if (!_containerEl) {
      _containerEl = el;
    }
    return _containerEl;
  };

  // Wrap functions to provide their lexical scope
  const wrapFn = (fn: TYPE): TYPE => {
    if (typeof fn !== 'function' || (!capture?.length && !captureRef?.length)) {
      return fn;
    }
    return function (this: unknown, ...args: QrlArgs<TYPE>) {
      let context = tryGetInvokeContext();
      if (context) {
        const prevQrl = context.$qrl$;
        context.$qrl$ = qrl;
        const prevEvent = context.$event$;
        if (context.$event$ === undefined) {
          context.$event$ = this as Event;
        }
        try {
          return fn.apply(this, args);
        } finally {
          context.$qrl$ = prevQrl;
          context.$event$ = prevEvent;
        }
      }
      context = newInvokeContext();
      context.$qrl$ = qrl;
      context.$event$ = this as Event;
      return invoke.call(this, context, fn as any, ...args);
    } as TYPE;
  };

  const resolve = async (containerEl?: Element): Promise<TYPE> => {
    if (symbolRef !== null) {
      // Resolving (Promise) or already resolved (value)
      return symbolRef;
    }
    if (containerEl) {
      setContainer(containerEl);
    }
    if (chunk === '') {
      // Sync QRL
      assertDefined(_containerEl, 'Sync QRL must have container element');
      const hash = _containerEl.getAttribute(QInstance)!;
      const doc = _containerEl.ownerDocument!;
      const qFuncs = getQFuncs(doc, hash);
      // No need to wrap, syncQRLs can't have captured scope
      return (qrl.resolved = symbolRef = qFuncs[Number(symbol)] as TYPE);
    }

    if (isBrowser && chunk) {
      /** We run the QRL, so now the probability of the chunk is 100% */
      preload(chunk, 1);
    }

    const start = now();
    const ctx = tryGetInvokeContext();
    if (symbolFn !== null) {
      symbolRef = symbolFn().then((module) => (qrl.resolved = symbolRef = wrapFn(module[symbol])));
    } else {
      const imported = getPlatform().importSymbol(_containerEl, chunk, symbol);
      symbolRef = maybeThen(imported, (ref) => (qrl.resolved = symbolRef = wrapFn(ref)));
    }
    if (typeof symbolRef === 'object' && isPromise(symbolRef)) {
      symbolRef.then(
        () => emitUsedSymbol(symbol, ctx?.$element$, start),
        (err) => {
          console.error(`qrl ${symbol} failed to load`, err);
          // We shouldn't cache rejections, we can try again later
          symbolRef = null;
        }
      );
    }
    return symbolRef;
  };

  const resolveLazy = (containerEl?: Element): ValueOrPromise<TYPE> => {
    return symbolRef !== null ? symbolRef : resolve(containerEl);
  };

  function invokeFn(
    this: unknown,
    currentCtx?: InvokeContext | InvokeTuple,
    beforeFn?: () => void | boolean
  ) {
    // Note that we bind the current `this`
    return (...args: QrlArgs<TYPE>): QrlReturn<TYPE> =>
      maybeThen(resolveLazy(), (f) => {
        if (!isFunction(f)) {
          throw qError(QError_qrlIsNotFunction);
        }
        if (beforeFn && beforeFn() === false) {
          return;
        }
        const context = createOrReuseInvocationContext(currentCtx);
        return invoke.call(this, context, f, ...(args as Parameters<typeof f>));
      });
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
  if (symbolRef) {
    // Replace symbolRef with (a promise for) the value or wrapped function
    symbolRef = maybeThen(symbolRef, (resolved) => (qrl.resolved = symbolRef = wrapFn(resolved)));
  }
  if (qDev) {
    seal(qrl);
  }
  if (isBrowser && resolvedSymbol) {
    /**
     * Preloading the symbol instead of the chunk allows us to get probabilities for the bundle
     * based on its contents.
     */
    preload(resolvedSymbol, 0.8);
  }
  return qrl;
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

export function assertSignal<T>(obj: unknown): asserts obj is SignalInternal<T> {
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

export const emitEvent = <T extends CustomEvent = any>(eventName: string, detail: T['detail']) => {
  if (!qTest && !isServerPlatform() && typeof document === 'object') {
    document.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: false,
        detail,
      }) as T
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
