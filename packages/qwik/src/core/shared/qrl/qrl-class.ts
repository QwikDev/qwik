// keep these imports above the rest to prevent circular dep issues
import { getPlatform, isServerPlatform } from '../platform/platform';
import { verifySerializable } from '../serdes/verify';
// ^^^ keep these imports above the rest to prevent circular dep issues

import { isBrowser, isDev } from '@qwik.dev/core/build';
import { invokeApply, tryGetInvokeContext, type InvokeContext } from '../../use/use-core';
import { assertDefined } from '../error/assert';
import { QError, qError } from '../error/error';
import { getQFuncs } from '../utils/markers';
import { isPromise, maybeThen } from '../utils/promises';
import { qDev, qSerialize, qTest, seal } from '../utils/qdev';
import { isFunction, type ValueOrPromise } from '../utils/types';
import type { QRLDev } from './qrl';
import { getSymbolHash, SYNC_QRL } from './qrl-utils';
import type { QRL, QrlArgs, QrlReturn } from './qrl.public';
// @ts-expect-error we don't have types for the preloader
import { p as preload } from '@qwik.dev/core/preloader';
import { DomContainer } from '../../client/dom-container';
import type { Container } from '../types';
import { ElementVNode } from '../vnode/element-vnode';
import { loading } from '../serdes/inflate';

interface SyncQRLSymbol {
  $symbol$: typeof SYNC_QRL;
}

export type SyncQRLInternal = QRLInternal & SyncQRLSymbol;

export type QRLInternalMethods<TYPE> = {
  readonly $chunk$: string | null;
  readonly $symbol$: string;
  readonly $hash$: string;

  /** If it's a string it's serialized */
  $captures$: Readonly<unknown[]> | string | null;
  dev: QRLDev | null;

  resolve(container?: Container): Promise<TYPE>;
  resolved: undefined | TYPE;

  getSymbol(): string;
  getHash(): string;
  getCaptured(): unknown[] | null;
  getFn(
    currentCtx?: InvokeContext,
    beforeFn?: () => void
  ): TYPE extends (...args: any) => any
    ? (...args: Parameters<TYPE>) => ValueOrPromise<ReturnType<TYPE>>
    : // unknown so we allow assigning function QRLs to any
      unknown;

  /**
   * Needed for deserialization and importing. We don't always have the container while creating
   * qrls in async sections of code
   */
  $container$: Container | null;
  /** Only in dev mode */
  $symbolRef$?: null | ValueOrPromise<TYPE>;
};

/** @internal */
export type QRLInternal<TYPE = unknown> = QRL<TYPE> & QRLInternalMethods<TYPE>;

/**
 * The current captured scope during QRL invocation. This is used to provide the lexical scope for
 * QRL functions. It is used one time per invocation, synchronously, so it is safe to store it in
 * module scope.
 *
 * @internal
 */
export let _captures: Readonly<unknown[]> | null = null;
export const setCaptures = (captures: Readonly<unknown[]> | null) => {
  _captures = captures;
};

export const deserializeCaptures = (container: Container, captures: string) => {
  const refs = [];
  for (const id of captures.split(' ')) {
    refs.push(container.$getObjectById$(id));
  }
  return refs;
};

/** Puts the qrl captures into `_captures`, and returns a Promise that should be awaited if possible */
const ensureQrlCaptures = (qrl: QRLInternal) => {
  // We read the captures once, synchronously, so no need to keep previous
  _captures = qrl.$captures$ as any;
  if (typeof _captures === 'string') {
    if (!qrl.$container$) {
      throw qError(QError.qrlMissingContainer);
    }
    const prevLoading = loading;
    _captures = qrl.$captures$ = deserializeCaptures(qrl.$container$, _captures);
    if (loading !== prevLoading) {
      // return the loading promise so callers can await it
      return loading;
    }
  }
};

function bindFnToContext<TYPE>(
  this: unknown,
  qrl: QRLInternal,
  currentCtx?: InvokeContext,
  beforeFn?: () => void | boolean
) {
  // Note that we bind the current `this`
  const bound = (...args: QrlArgs<TYPE>): ValueOrPromise<QrlReturn<TYPE> | undefined> => {
    if (!qrl.resolved) {
      return qrl.resolve().then((fn) => {
        if (!isFunction(fn)) {
          throw qError(QError.qrlIsNotFunction);
        }
        return bound(...args);
      });
    }
    if (beforeFn && beforeFn() === false) {
      return;
    }
    return invokeApply.call(this, currentCtx, qrl.resolved as any, args);
  };
  return bound;
}

// Wrap functions to provide their lexical scope
const bindCaptures = <TYPE>(qrl: QRLInternal, fn: TYPE): TYPE => {
  if (typeof fn !== 'function' || !qrl.$captures$) {
    return fn;
  }
  return function withCaptures(this: unknown, ...args: QrlArgs<TYPE>) {
    ensureQrlCaptures(qrl);
    return fn.apply(this, args);
  } as TYPE;
};

const makeResolveFunction = <TYPE>(
  qrl: QRLInternal<TYPE>,
  symbolFn: () => Promise<Record<string, TYPE>>
) => {
  let symbolRef: ValueOrPromise<TYPE> | null;
  // Always return a promise, even for sync QRLs
  return async (container?: Container): Promise<TYPE> => {
    if (symbolRef != null) {
      // Resolving (Promise) or already resolved (value)
      return symbolRef;
    }
    if (container) {
      qrl.$container$ = container;
    } else if (!qrl.$container$) {
      const ctx = tryGetInvokeContext();
      if (ctx?.$container$) {
        qrl.$container$ = ctx.$container$;
      }
    }
    if (qrl.$chunk$ === '') {
      // Sync QRL
      isDev && assertDefined(qrl.$container$, 'Sync QRL must have container element');
      const hash = (qrl.$container$ as DomContainer).$instanceHash$;
      const doc = (qrl.$container$ as DomContainer).element?.ownerDocument || document;
      const qFuncs = getQFuncs(doc, hash);
      // No need to wrap, syncQRLs can't have captured scope
      return (qrl.resolved = symbolRef = qFuncs[Number(qrl.$symbol$)] as TYPE);
    }

    if (isBrowser && qrl.$chunk$) {
      /** We run the QRL, so now the probability of the chunk is 100% */
      preload(qrl.$chunk$, 1);
    }

    const start = now();
    const symbol = qrl.$symbol$;
    const importP = symbolFn
      ? symbolFn().then((module) => module[symbol] as TYPE)
      : getPlatform().importSymbol(
          (qrl.$container$ as DomContainer | null)?.element,
          qrl.$chunk$,
          symbol
        );

    symbolRef = maybeThen(importP, (resolved) => {
      // We memoize the result on the symbolFn
      // Make sure not to memoize the wrapped function!
      if (symbolFn) {
        (symbolFn as any)[symbol] = resolved;
      }
      return (symbolRef = qrl.resolved = bindCaptures(qrl, resolved as TYPE));
    });

    if (isPromise(symbolRef)) {
      const ctx = tryGetInvokeContext();
      symbolRef.then(
        () =>
          emitUsedSymbol(
            symbol,
            ctx?.$hostElement$ instanceof ElementVNode ? ctx?.$hostElement$.node : undefined,
            start
          ),
        (err) => {
          console.error(`qrl ${symbol} failed to load`, err);
          // We shouldn't cache rejections, we can try again later
          symbolRef = null;
        }
      );
    }

    // Try to deserialize captures if any
    if (qrl.$container$) {
      await ensureQrlCaptures(qrl);
    }

    return symbolRef as TYPE;
  };
};

function getSymbol(this: QRLInternal): string {
  return this.$symbol$;
}

function getHash(this: QRLInternal): string {
  return this.$hash$;
}

function getCaptured(this: QRLInternal): unknown[] | null {
  ensureQrlCaptures(this);
  return this.$captures$ as unknown[] | null;
}

/**
 * Creates a QRL instance to represent a lazily loaded value. Normally this is a function, but it
 * can be any value.
 *
 * When the value is a function, calling the returned qrl will load the underlying code when
 * invoked, and call it with the captured scope. This always returns a promise since the code may
 * not be loaded yet.
 *
 * To get the underlying function without invoking it, await `qrl.resolve()` and then `qrl.resolved`
 * holds the loaded function, wrapped with the captured scope.
 *
 * @internal
 */
export const createQRL = <TYPE>(
  chunk: string | null,
  symbol: string,
  symbolRef?: null | ValueOrPromise<TYPE>,
  symbolFn?: null | (() => Promise<Record<string, TYPE>>),
  captures?: Readonly<unknown[]> | string | null
): QRLInternal<TYPE> => {
  // In dev mode we need to preserve the original symbolRef without wrapping
  const origSymbolRef = symbolRef;
  if (qDev && qSerialize) {
    if (captures && typeof captures === 'object') {
      for (const item of captures) {
        verifySerializable(item, 'Captured variable in the closure can not be serialized');
      }
    }
  }

  const qrl: QRLInternal<TYPE> = async function qrlFn(this: unknown, ...args: QrlArgs<TYPE>) {
    if (qrl.resolved) {
      return (qrl.resolved as any).apply(this, args);
    }

    // grab the context while we are sync
    const ctx = tryGetInvokeContext();

    await qrl.resolve(ctx?.$container$);

    return invokeApply.call(this, ctx, qrl.resolved as any, args);
  } as QRLInternal<TYPE>;

  // Retrieve memoized result from symbolFn
  if (symbolFn && symbol in symbolFn) {
    symbolRef = (symbolFn as any)[symbol];
  }

  const resolve =
    symbolRef != null ? async () => symbolRef as TYPE : makeResolveFunction(qrl, symbolFn!);

  const hash = getSymbolHash(symbol);

  Object.assign(qrl, {
    getSymbol,
    getHash,
    getCaptured,
    // This can be called with other `this`
    getFn: function (this: unknown, currentCtx?: InvokeContext, beforeFn?: () => void | boolean) {
      return bindFnToContext.call(this, qrl, currentCtx, beforeFn);
    },
    resolve,

    resolved: undefined,

    $chunk$: chunk,
    $symbol$: symbol,
    $hash$: hash,
    $captures$: captures!,
    $container$: null,
  } as QRLInternal);

  if (qDev) {
    qrl.dev = null;
    qrl.$symbolRef$ = origSymbolRef;
    seal(qrl);
  }

  // Now that the qrl is fully constructed, we can resolve/wrap the symbolRef if we received it. If it is a plain value without computed captures, the qrl will be resolved immediately.
  if (symbolRef != null) {
    symbolRef = maybeThen(ensureQrlCaptures(qrl), () =>
      maybeThen(symbolRef, (resolved) => {
        symbolRef = qrl.resolved = bindCaptures(qrl, resolved as TYPE);
        return symbolRef;
      })
    );
  }

  if (isBrowser && symbol) {
    /**
     * Preloading the symbol instead of the chunk allows us to get probabilities for the bundle
     * based on its contents.
     */
    preload(symbol, 0.8);
  }
  return qrl;
};

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
