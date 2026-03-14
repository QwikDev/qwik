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
import { qDev, qTest } from '../utils/qdev';
import { isFunction, type ValueOrPromise } from '../utils/types';
import type { QRLDev } from './qrl';
import { getSymbolHash, SYNC_QRL } from './qrl-utils';
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
  readonly $captures$?: Readonly<unknown[]> | string | null;
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

  /** Get a new QRL for these captures, reusing the lazy ref */
  $withCaptures$(captures: Readonly<unknown[]> | string | null): QRLInternal<TYPE>;

  /** Set the ref of the QRL */
  $setRef$(ref: ValueOrPromise<TYPE>): void;

  /**
   * Needed for deserialization and importing. We don't always have the container while creating
   * qrls in async sections of code
   */
  readonly $container$?: Container | null;

  /** The shared lazy-loading reference */
  readonly $lazy$: LazyRef<TYPE>;
};

/**
 * Shared lazy-loading reference that holds module loading metadata. Multiple QRLs pointing to the
 * same chunk+symbol can share a single LazyRef, differing only in their captured scope.
 */
export class LazyRef<TYPE = unknown> {
  $container$: Container | undefined;
  // Don't allocate dev property immediately so that in prod we don't have this property
  dev?: QRLDev | null | undefined;

  constructor(
    readonly $chunk$: string | null,
    readonly $symbol$: string,
    readonly $symbolFn$: undefined | null | (() => Promise<Record<string, TYPE>>),
    public $ref$?: null | ValueOrPromise<TYPE>,
    container?: Container | null
  ) {
    if ($ref$) {
      this.$setRef$($ref$);
    }
    if (container && !$ref$ && typeof $chunk$ === 'string' && !$symbolFn$) {
      // We only store the container if we're going to import the chunk
      // Note that this container is not necessarily the same one as from the captures
      this.$container$ = container;
    }
    if (qDev) {
      // this will be filled in later
      this.dev = null;
    }

    /** Preload the chunk with somewhat lower probability when we create the QRL. */
    if (isBrowser && $chunk$) {
      preload($chunk$, 0.8);
    }
  }

  /** We don't read hash very often so let's not allocate a string for every QRL */
  get $hash$(): string {
    return getSymbolHash(this.$symbol$);
  }

  $setRef$(ref: ValueOrPromise<TYPE>) {
    this.$ref$ = ref;
    if (isPromise(ref)) {
      ref.then(
        (r) => (this.$ref$ = r),
        (err) => {
          console.error(`qrl ${this.$symbol$} failed to load`, err);
          // We shouldn't cache rejections, we can try again later
          this.$ref$ = null;
        }
      );
    }
  }

  /** Load the raw module export without capture binding. */
  $load$(): ValueOrPromise<TYPE> {
    if (this.$ref$ != null) {
      return this.$ref$;
    }

    if (this.$chunk$ === '') {
      // Sync QRL
      isDev && assertDefined(this.$container$, 'Sync QRL must have container element');
      const hash = (this.$container$ as DomContainer).$instanceHash$;
      const doc = (this.$container$ as DomContainer).element?.ownerDocument || document;
      const qFuncs = getQFuncs(doc, hash);
      return (this.$ref$ = qFuncs[Number(this.$symbol$)] as TYPE);
    }

    if (isBrowser && this.$chunk$) {
      /** We will run the QRL, so now the probability of the chunk is 100% */
      preload(this.$chunk$, 1);
    }

    const symbol = this.$symbol$;
    const importP: Promise<TYPE> = this.$symbolFn$
      ? this.$symbolFn$().then((module) => module[symbol] as TYPE)
      : (getPlatform().importSymbol(
          (this.$container$ as DomContainer | null)?.element,
          this.$chunk$,
          symbol
        ) as Promise<TYPE>);

    this.$setRef$(importP);

    return this.$ref$ as TYPE;
  }
}

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
  resolved: undefined | TYPE = undefined;
  // This is defined or undefined for the lifetime of the QRL, so we set it lazily
  $captures$?: Readonly<unknown[]> | string | null;
  $container$?: Container | null;

  constructor(
    readonly $lazy$: LazyRef<TYPE>,
    $captures$?: Readonly<unknown[]> | string | null,
    container?: Container | null
  ) {
    super();
    if ($captures$) {
      this.$captures$ = $captures$;
      if (typeof $captures$ === 'string') {
        // We cannot rely on the container of the lazy ref, it may be missing or different
        this.$container$ = container;
      }
      if (qDev) {
        if ($captures$ && typeof $captures$ === 'object') {
          for (const item of $captures$) {
            verifySerializable(item, 'Captured variable in the closure can not be serialized');
          }
        }
      }
    }

    // If it is plain value with deserialized or missing captures, resolve it immediately
    // Otherwise we keep using the async path so we can wait for qrls to load
    if ($lazy$.$ref$ != null && typeof this.$captures$ !== 'string' && !isPromise($lazy$.$ref$)) {
      // we can pass this instead of using getInstance because we know we are not the qrlFn
      this.resolved = bindCaptures(this, $lazy$.$ref$ as TYPE);
    }
  }

  $withCaptures$(captures: Readonly<unknown[]> | string | null): QRLInternal<TYPE> {
    const newQrl = new QRLClass<TYPE>(
      this.$lazy$,
      captures!,
      this.$captures$ ? this.$container$ : undefined
    );
    return makeQrlFn(newQrl);
  }

  $setRef$(ref: ValueOrPromise<TYPE>) {
    const qrl = getInstance(this);
    qrl.$lazy$.$setRef$(ref);
    qrl.resolved = bindCaptures(qrl, ref as TYPE);
  }

  // --- Getter proxies for backward compat ---
  get $chunk$(): string | null {
    return this.$lazy$.$chunk$;
  }
  get $symbol$(): string {
    return this.$lazy$.$symbol$;
  }
  get $hash$(): string {
    return this.$lazy$.$hash$;
  }
  get dev(): QRLDev | null | undefined {
    return this.$lazy$.dev;
  }

  $callFn$(withThis: unknown, ...args: QrlArgs<TYPE>): ValueOrPromise<QrlReturn<TYPE>> {
    if (this.resolved) {
      return (this.resolved as any).apply(withThis, args);
    }

    // Not resolved yet: we'll return a promise

    // grab the context while we are sync
    const ctx = tryGetInvokeContext();

    return this.resolve(ctx?.$container$).then(() =>
      invokeApply.call(withThis, ctx, this.resolved as any, args)
    );
  }

  async resolve(container?: Container): Promise<TYPE> {
    // We need to write to the QRLClass instance, not the function
    const qrl = getInstance<TYPE>(this);
    return maybeThen($resolve$(qrl, container), () => qrl.resolved!);
  }

  getSymbol(): string {
    return this.$symbol$;
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
    const bound = (...args: QrlArgs<TYPE>): unknown => {
      if (!qrl.resolved) {
        return qrl.resolve().then((fn) => {
          if (qDev && !isFunction(fn)) {
            throw qError(QError.qrlIsNotFunction);
          }
          return bound(...args);
        });
      }
      if (beforeFn && beforeFn() === false) {
        return undefined;
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
  const container = qrl.$container$;
  if (typeof _captures === 'string') {
    if (!container) {
      throw qError(QError.qrlMissingContainer);
    }
    const prevLoading = loading;
    _captures = qrl.$captures$ = deserializeCaptures(container, _captures);
    if (loading !== prevLoading) {
      // return the loading promise so callers can await it
      return loading;
    }
  }
};

// Wrap functions to provide their lexical scope
const bindCaptures = <TYPE>(qrl: QRLClass<unknown>, ref: TYPE): TYPE => {
  if (typeof ref !== 'function' || !qrl.$captures$) {
    return ref;
  }
  return function boundCaptures(this: unknown, ...args: QrlArgs<TYPE>) {
    ensureQrlCaptures(qrl);
    return ref.apply(this, args);
  } as TYPE;
};

const $resolve$ = <TYPE>(
  qrl: QRLClass<TYPE>,
  container?: Container | null
): ValueOrPromise<void> => {
  const lazy = qrl.$lazy$;

  const shouldDeserialize = typeof qrl.$captures$ === 'string';
  if (shouldDeserialize && !qrl.$container$) {
    if (container) {
      qrl.$container$ = container;
    } else {
      qrl.$container$ = tryGetInvokeContext()?.$container$ as Container;
    }
  }

  if (qrl.resolved) {
    return;
  }

  // Capture context while still sync
  const start = now();
  const ctx = tryGetInvokeContext();

  // Load raw value via LazyRef - may be sync (e.g. sync QRLs) or async
  const rawOrPromise = lazy.$load$();

  const maybePromise = maybeThen(rawOrPromise, (raw) => {
    qrl.resolved = bindCaptures(qrl, raw);
  });

  if (maybePromise) {
    // We're importing; emit symbol usage event
    const symbol = lazy.$symbol$;
    emitUsedSymbol(
      symbol,
      ctx?.$hostElement$ instanceof ElementVNode ? ctx?.$hostElement$.node : undefined,
      start
    );
  }

  const capturedPromise = shouldDeserialize && qrl.$container$ && ensureQrlCaptures(qrl);

  if (capturedPromise) {
    return capturedPromise.then(() => maybePromise);
  }
  return maybePromise;
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
  const lazy = new LazyRef<TYPE>(chunk, symbol, symbolFn, symbolRef, container);
  const qrl = new QRLClass<TYPE>(lazy, captures!, container);

  return makeQrlFn(qrl);
};

const makeQrlFn = <TYPE>(qrl: QRLClass<TYPE>): QRLInternal<TYPE> => {
  // The QRL has to be callable, so we create a function that calls the internal $callFn$
  const qrlFn: QRLInternal<TYPE> = async function (this: unknown, ...args: QrlArgs<TYPE>) {
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
