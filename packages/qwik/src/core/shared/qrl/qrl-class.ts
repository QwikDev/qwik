// keep these imports above the rest to prevent circular dep issues
import { getPlatform, isServerPlatform } from '../platform/platform';
import { verifySerializable } from '../serdes/verify';
// ^^^ keep these imports above the rest to prevent circular dep issues

import { isBrowser } from '@qwik.dev/core/build';
import {
  invoke,
  newInvokeContext,
  tryGetInvokeContext,
  type InvokeContext,
} from '../../use/use-core';
import { assertDefined } from '../error/assert';
import { QError, qError } from '../error/error';
import { getQFuncs, QInstanceAttr } from '../utils/markers';
import { isPromise, maybeThen } from '../utils/promises';
import { qDev, qSerialize, qTest, seal } from '../utils/qdev';
import { isFunction, type ValueOrPromise } from '../utils/types';
import type { QRLDev } from './qrl';
import { getSymbolHash, SYNC_QRL } from './qrl-utils';
import type { QRL, QrlArgs, QrlReturn } from './qrl.public';
// @ts-expect-error we don't have types for the preloader
import { p as preload } from '@qwik.dev/core/preloader';
import { ElementVNode } from '../vnode/element-vnode';
import { type DomContainer } from '../../client/dom-container';
import type { Container } from '../types';

interface SyncQRLSymbol {
  $symbol$: typeof SYNC_QRL;
}

export type SyncQRLInternal = QRLInternal & SyncQRLSymbol;

export type QRLInternalMethods<TYPE> = {
  readonly $chunk$: string | null;
  readonly $symbol$: string;
  readonly $hash$: string;

  $capture$: string[] | null;
  $captureRef$: unknown[] | null;
  dev: QRLDev | null;

  resolved: undefined | TYPE;

  resolve(containerEl?: Element): Promise<TYPE>;
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

  $setContainer$(container: Container | undefined): Container | undefined;
};

/** @internal */
export type QRLInternal<TYPE = unknown> = QRL<TYPE> & QRLInternalMethods<TYPE>;

const resolvedSymbol = Symbol('resolved');

export const createQRL = <TYPE>(
  chunk: string | null,
  symbol: string,
  symbolRef: null | ValueOrPromise<TYPE>,
  symbolFn: null | (() => Promise<Record<string, TYPE>>),
  capture: null | Readonly<number[]>,
  captureRef: Readonly<unknown[]> | null
): QRLInternal<TYPE> => {
  if (qDev && qSerialize) {
    if (captureRef) {
      for (const item of captureRef) {
        verifySerializable(item, 'Captured variable in the closure can not be serialized');
      }
    }
  }

  let _container: Container | undefined;

  const qrl = async function (this: unknown, ...args: QrlArgs<TYPE>) {
    // grab the context while we are sync
    const boundFn = bindFnToContext.call(this, tryGetInvokeContext());
    const result = await boundFn(...args);
    return result;
  } as QRLInternal<TYPE>;

  const setContainer = (container: Container | undefined) => {
    if (!_container) {
      _container = container;
    }
    return _container;
  };

  const checkCaptures = () => {
    if (qrl.$capture$) {
      if (!_container) {
        throw qError(QError.qrlMissingContainer);
      }
      const refs = [];
      for (const id of qrl.$capture$) {
        refs.push(_container.$getObjectById$(id));
      }
      qrl.$captureRef$ = refs;
      qrl.$capture$ = null;
    }
  };

  function bindFnToContext(
    this: unknown,
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
      const context = createOrReuseInvocationContext(currentCtx);
      checkCaptures();
      const prevCaptures = context.$captures$;
      const prevEvent = context.$event$;
      // Note that we set the qrl here instead of in wrapFn because
      // it is possible we're called on a copied qrl
      context.$captures$ = qrl.$captureRef$;
      context.$event$ ||= this as Event;
      if (!context.$container$) {
        context.$container$ = _container;
      }
      try {
        return invoke.call(this, context, symbolRef as any, ...(args as any));
      } finally {
        context.$captures$ = prevCaptures;
        context.$event$ = prevEvent;
      }
    };
    return bound;
  }

  // Wrap functions to provide their lexical scope
  const wrapFn = (fn: TYPE): TYPE => {
    if (typeof fn !== 'function' || (!qrl.$capture$?.length && !captureRef?.length)) {
      return fn;
    }
    return function (this: unknown, ...args: QrlArgs<TYPE>) {
      let context = tryGetInvokeContext();
      checkCaptures();
      // use the given qrl if it is the right one
      if (context) {
        const prevCaptures = context.$captures$;
        context.$captures$ = qrl.$captureRef$;
        if (!qrl.$captureRef$ || !context.$captures$) {
          console.error('QRL called without captures being resolved', qrl);
        }
        console.log('hi there');
        try {
          return fn.apply(this, args);
        } finally {
          context.$captures$ = prevCaptures;
        }
      }
      context = newInvokeContext();
      context.$captures$ = qrl.$captureRef$;
      context.$event$ = this as Event;
      return invoke.call(this, context, fn as any, ...args);
    } as TYPE;
  };

  // Retrieve memoized result from symbolFn
  if (symbolFn && resolvedSymbol in symbolFn) {
    symbolRef = symbolFn[resolvedSymbol] as TYPE;
  }

  const resolve = symbolRef
    ? async () => symbolRef as TYPE
    : async (container?: Container): Promise<TYPE> => {
        if (symbolRef !== null) {
          // Resolving (Promise) or already resolved (value)
          return symbolRef;
        }
        if (container) {
          setContainer(container);
        }
        if (chunk === '') {
          // Sync QRL
          assertDefined(_container, 'Sync QRL must have container element');
          const hash = (_container as DomContainer).element.getAttribute(QInstanceAttr)!;
          const doc = (_container as DomContainer).element.ownerDocument!;
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
          symbolRef = symbolFn().then((module) => {
            const resolved = wrapFn((symbolRef = module[symbol]));
            // We memoize the result on the symbolFn
            (symbolFn as any)[resolvedSymbol] = resolved;
            qrl.resolved = resolved;
            return resolved;
          });
        } else {
          // TODO cache the imported symbol but watch out for dev mode
          const imported = getPlatform().importSymbol(
            (container as DomContainer).element,
            chunk,
            symbol
          );
          symbolRef = maybeThen(imported, (ref) => (qrl.resolved = wrapFn((symbolRef = ref))));
        }
        if (isPromise(symbolRef)) {
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
        return symbolRef;
      };

  const createOrReuseInvocationContext = (invoke: InvokeContext | undefined) => {
    if (invoke == null) {
      return newInvokeContext();
    } else {
      return invoke;
    }
  };

  const hash = getSymbolHash(symbol);

  Object.assign(qrl, {
    getSymbol: () => symbol,
    getHash: () => hash,
    // captureRef is replaced during deserialization
    getCaptured: () => qrl.$captureRef$,
    resolve,
    $setContainer$: setContainer,
    $chunk$: chunk,
    $symbol$: symbol,
    $hash$: hash,
    getFn: bindFnToContext,

    $capture$: capture,
    $captureRef$: captureRef,
    dev: null,
    resolved: undefined,
  });

  if (symbolRef) {
    // Unwrap any promises
    symbolRef = maybeThen(symbolRef, (resolved) => (qrl.resolved = wrapFn((symbolRef = resolved))));
  }

  if (qDev) {
    seal(qrl);
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
