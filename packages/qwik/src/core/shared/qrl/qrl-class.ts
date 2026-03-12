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
import { SYNC_QRL } from './qrl-utils';
import type { QRL, QrlArgs, QrlReturn } from './qrl.public';
// @ts-expect-error we don't have types for the preloader
import { p as preload } from '@qwik.dev/core/preloader';
import { DomContainer } from '../../client/dom-container';
import { loading } from '../serdes/inflate';
import type { Container } from '../types';
import { ElementVNode } from '../vnode/element-vnode';

interface SyncQRLSymbol {
  $symbol$: typeof SYNC_QRL;
}

export type SyncQRLInternal = QRLInternal & SyncQRLSymbol;
/** @internal */
export type QRLInternal<TYPE = unknown> = QRL<TYPE> & QRLInternalMethods<TYPE>;

export type QRLInternalMethods<TYPE> = {
  readonly $chunk$: string | null;
  readonly $symbol$: string;
  readonly $hash$: string;

  /** If it's a string it's serialized */
  readonly $captures$: Readonly<unknown[]> | string | null;
  dev?: QRLDev | null;

  resolve(container?: Container): Promise<TYPE>;
  resolved: undefined | TYPE;

  getSymbol(): string;
  getHash(): string;
  getCaptured(): unknown[] | null;
  getFn(
    currentCtx?: InvokeContext,
    /** If this returns false, the function execution will be skipped */
    beforeFn?: () => void | false
  ): TYPE extends (...args: any) => any
    ? (...args: Parameters<TYPE>) => ValueOrPromise<ReturnType<TYPE> | undefined>
    : // unknown instead of never so we allow assigning function QRLs to any
      unknown;

  $callFn$(withThis: unknown, ...args: QrlArgs<TYPE>): ValueOrPromise<QrlReturn<TYPE>>;

  /**
   * Needed for deserialization and importing. We don't always have the container while creating
   * qrls in async sections of code
   */
  readonly $container$: Container | null | undefined;
  $setContainer$(container: Container): void;
  $setDev$(dev: QRLDev): void;

  /** Only in dev mode */
  $origSymbolRef$?: null | ValueOrPromise<TYPE>;
};

/**
 * When a method is called on the qrlFn wrapper function, `this` is the function, not the QRLClass
 * instance that holds the data. This helper returns the actual instance by checking whether `this`
 * owns `resolved` (always set on the instance).
 */
const getInstance = <TYPE>(instance: any): QRLClass<TYPE> => {
  return Object.prototype.hasOwnProperty.call(instance, 'resolved')
    ? instance
    : (Object.getPrototypeOf(instance) as QRLClass<TYPE>);
};

/**
 * We use a class here to avoid copying all the methods for every QRL instance. The QRL itself is a
 * function that calls the internal $callFn$ method, and we set the prototype to the class instance
 * so it has access to all the properties and methods. That's why we need to extend Function, so
 * that `.apply()` etc work.
 *
 * So a QRL is a function that has a prototype of a QRLClass instance. This is unconventional, but
 * it allows us to have a callable QRL that is also a class.
 *
 * Note the use of getInstance everywhere when writing to `this`. If you write to `this` directly,
 * it will be stored on the function itself, and we don't want that because the QRLClass instance
 * doesn't have access to it, and it uses more memory.
 */
class QRLClass<TYPE> extends Function implements QRLInternalMethods<TYPE> {
  constructor(
    readonly $chunk$: string | null,
    readonly $symbol$: string,
    readonly $symbolFn$: undefined | null | (() => Promise<Record<string, TYPE>>),
    private $ref$: undefined | null | ValueOrPromise<TYPE>,
    public $captures$: Readonly<unknown[]> | string | null,
    public $container$: Container | null | undefined
  ) {
    super();
    // Retrieve memoized result from symbolFn
    if ($symbolFn$ && !$ref$ && $symbol$ in $symbolFn$) {
      this.$ref$ = ($symbolFn$ as any)[$symbol$];
    }

    // resolve/wrap the symbolRef if we received it. If it is a plain value without computed captures, the qrl will be resolved immediately.
    if (this.$ref$ != null) {
      this.$ref$ = maybeThen(ensureQrlCaptures(this), () =>
        maybeThen(this.$ref$, (resolved) => {
          this.$ref$ = this.resolved = bindCaptures(this, resolved as TYPE);
          return this.$ref$;
        })
      );
    }

    /** Preload the chunk with somewhat lower probability when we create the QRL. */
    if (isBrowser && $chunk$) {
      preload($chunk$, 0.8);
    }
  }

  resolved: undefined | TYPE = undefined;
  $hashIndex$: number | null = null;
  // Don't allocate dev property immediately so that in prod we don't have this property
  dev?: QRLDev | null | undefined;

  $setContainer$(container: Container): void {
    getInstance(this).$container$ = container;
  }

  $setDev$(dev: QRLDev): void {
    getInstance(this).dev = dev;
  }

  $callFn$(withThis: unknown, ...args: QrlArgs<TYPE>): ValueOrPromise<QrlReturn<TYPE>> {
    const qrl = getInstance<TYPE>(this);
    if (qrl.resolved) {
      return (qrl.resolved as any).apply(withThis, args);
    }

    // Not resolved yet, return a promise

    // grab the context while we are sync
    const ctx = tryGetInvokeContext();

    return qrl
      .resolve(ctx?.$container$)
      .then(() => invokeApply.call(withThis, ctx, qrl.resolved as any, args));
  }

  async resolve(container?: Container): Promise<TYPE> {
    const qrl = getInstance<TYPE>(this);
    if (container) {
      qrl.$container$ = container;
    } else if (!qrl.$container$) {
      qrl.$container$ = tryGetInvokeContext()?.$container$ as Container;
    }

    if (qrl.$ref$ != null) {
      // Resolving (Promise) or already resolved (value)
      return qrl.$ref$;
    }

    if (qrl.$chunk$ === '') {
      // Sync QRL
      isDev && assertDefined(qrl.$container$, 'Sync QRL must have container element');
      const hash = (qrl.$container$ as DomContainer).$instanceHash$;
      const doc = (qrl.$container$ as DomContainer).element?.ownerDocument || document;
      const qFuncs = getQFuncs(doc, hash);
      // No need to wrap, syncQRLs can't have captured scope
      return (qrl.resolved = qrl.$ref$ = qFuncs[Number(qrl.$symbol$)] as TYPE);
    }

    if (isBrowser && qrl.$chunk$) {
      /** We will run the QRL, so now the probability of the chunk is 100% */
      preload(qrl.$chunk$, 1);
    }

    const start = now();
    const symbol = qrl.$symbol$;
    const importP = qrl.$symbolFn$
      ? qrl.$symbolFn$().then((module) => module[symbol] as TYPE)
      : getPlatform().importSymbol(
          (qrl.$container$ as DomContainer | null)?.element,
          qrl.$chunk$,
          symbol
        );

    qrl.$ref$ = maybeThen(importP, (resolved) => {
      // We memoize the result on the symbolFn
      // Make sure not to memoize the wrapped function!
      if (qrl.$symbolFn$) {
        (qrl.$symbolFn$ as any)[symbol] = resolved;
      }
      return (qrl.$ref$ = qrl.resolved = bindCaptures(qrl, resolved as TYPE));
    });

    if (isPromise(qrl.$ref$)) {
      const ctx = tryGetInvokeContext();
      qrl.$ref$.then(
        () =>
          emitUsedSymbol(
            symbol,
            ctx?.$hostElement$ instanceof ElementVNode ? ctx?.$hostElement$.node : undefined,
            start
          ),
        (err) => {
          console.error(`qrl ${symbol} failed to load`, err);
          // We shouldn't cache rejections, we can try again later
          qrl.$ref$ = null;
        }
      );
    }

    // Try to deserialize captures if any
    if (qrl.$container$) {
      await ensureQrlCaptures(qrl);
    }

    return qrl.$ref$ as TYPE;
  }

  getSymbol(): string {
    return this.$symbol$;
  }

  /** We don't read hash very often so let's not allocate a string for every QRL */
  get $hash$(): string {
    const qrl = getInstance(this);
    qrl.$hashIndex$ ??= qrl.$symbol$.lastIndexOf('_') + 1;
    return qrl.$symbol$.slice(qrl.$hashIndex$);
  }
  getHash(): string {
    return this.$hash$;
  }

  getCaptured(): unknown[] | null {
    const qrl = getInstance(this);
    ensureQrlCaptures(qrl);
    return qrl.$captures$ as unknown[] | null;
  }

  getFn(
    currentCtx?: InvokeContext,
    beforeFn?: () => void | false
  ): TYPE extends (...args: any) => any
    ? (...args: Parameters<TYPE>) => ValueOrPromise<ReturnType<TYPE> | undefined>
    : // unknown instead of never so we allow assigning function QRLs to any
      unknown {
    const qrl = getInstance(this);
    const bound = (...args: QrlArgs<TYPE>): any => {
      if (!qrl.resolved) {
        return qrl.resolve().then((fn) => {
          if (qDev && !isFunction(fn)) {
            throw qError(QError.qrlIsNotFunction);
          }
          return bound(...args);
        }) as any;
      }
      if (beforeFn && beforeFn() === false) {
        return undefined as any;
      }
      return invokeApply(currentCtx, qrl.resolved as any, args);
    };
    return bound as any;
  }
}

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
const ensureQrlCaptures = (qrl: QRLClass<unknown>) => {
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

// Wrap functions to provide their lexical scope
const bindCaptures = <TYPE>(qrl: QRLClass<unknown>, fn: TYPE): TYPE => {
  if (typeof fn !== 'function' || !qrl.$captures$) {
    return fn;
  }
  return function withCaptures(this: unknown, ...args: QrlArgs<TYPE>) {
    ensureQrlCaptures(qrl);
    return fn.apply(this, args);
  } as TYPE;
};

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
  captures?: Readonly<unknown[]> | string | null,
  container?: Container
): QRLInternal<TYPE> => {
  // In dev mode we need to preserve the original symbolRef without wrapping
  let origSymbolRef: ValueOrPromise<TYPE> | null | undefined;
  if (qDev && qSerialize) {
    origSymbolRef = symbolRef;
    if (captures && typeof captures === 'object') {
      for (const item of captures) {
        verifySerializable(item, 'Captured variable in the closure can not be serialized');
      }
    }
  }

  const qrl = new QRLClass<TYPE>(chunk, symbol, symbolFn, symbolRef, captures!, container);
  if (qDev) {
    // we'll fill this in later
    qrl.dev = null;
    (qrl as QRLInternalMethods<TYPE>).$origSymbolRef$ = origSymbolRef;
    seal(qrl);
  }

  // The QRL has to be callable, so we create a function that calls the internal $callFn$
  const qrlFn: QRLInternal<TYPE> = async function qrlFn(this: unknown, ...args: QrlArgs<TYPE>) {
    return qrl.$callFn$(this, ...args);
  } as QRLInternal<TYPE>;
  // ...and set the prototype to the QRL instance so it has all the properties and methods without copying them
  Object.setPrototypeOf(qrlFn, qrl);

  return qrlFn;
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
