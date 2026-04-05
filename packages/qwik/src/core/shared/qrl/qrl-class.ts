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
  $setDev$(dev: QRLDev | null): void;

  /**
   * "with captures" - Get a new QRL for these captures, reusing the lazy ref. It's an internal
   * method but we need to have a stable name because it gets called in user code by the optimizer,
   * after the $name$ props are mangled
   */
  w(captures: Readonly<unknown[]> | string | null): QRLInternal<TYPE>;

  /**
   * "set ref" - Set the ref of the QRL. It's an internal method but we need to have a stable name
   * because it gets called in user code by the optimizer, after the $name$ props are mangled
   */
  s(ref: ValueOrPromise<TYPE>): void;

  /**
   * Needed for deserialization and importing. We don't always have the container while creating
   * qrls in async sections of code
   */
  readonly $container$?: Container | null;

  /** The shared lazy-loading reference */
  readonly $lazy$: LazyRef<TYPE>;
};

let allLazyRefs: Map<string, LazyRef<any>> | undefined;
let getLazyRef: <TYPE>(
  chunk: string | null,
  symbol: string,
  symbolFn: null | (() => Promise<Record<string, TYPE>>),
  ref: ValueOrPromise<TYPE> | undefined,
  container: Container | undefined
) => LazyRef<TYPE> = (chunk, symbol, symbolFn, ref, container) => {
  return new LazyRef(chunk, symbol, symbolFn, ref, container);
};

if (isBrowser && import.meta.hot) {
  allLazyRefs = new Map<string, LazyRef<any>>();

  getLazyRef = (chunk, symbol, symbolFn, ref, container) => {
    let lazyRef = allLazyRefs!.get(symbol);
    if (!lazyRef) {
      lazyRef = new LazyRef(chunk, symbol, symbolFn, ref, container);
      // Ignore sync QRLs
      if (chunk !== '') {
        allLazyRefs!.set(symbol, lazyRef);
      }
    }
    return lazyRef;
  };

  /** Replace or add `?t=<timestamp>` to a URL, preserving other query params. */
  const bustTimestamp = (url: string, t: number | string): string => {
    const [path, query] = url.split('?', 2);
    if (!query) {
      return `${path}?t=${t}`;
    }
    const params = query.split('&').filter((p) => !p.startsWith('t='));
    params.push(`t=${t}`);
    return `${path}?${params.join('&')}`;
  };

  document.addEventListener('qHmr' as any, (ev: CustomEvent<{ files: string[]; t: number }>) => {
    const files = ev.detail.files;
    const t = ev.detail.t || (document as any).__hmrT || Date.now();
    let didReload = false;
    for (const lazy of allLazyRefs!.values()) {
      const devFile = lazy.dev?.file || lazy.$chunk$;
      if (!devFile || !files.some((file) => devFile.startsWith(file))) {
        continue;
      }
      const chunk = lazy.$chunk$;
      if (chunk) {
        (lazy as any).$chunk$ = bustTimestamp(chunk, t);
        didReload = true;
      }
      const fnStr = lazy.$symbolFn$?.toString();
      if (fnStr) {
        const newStr = fnStr.replace(/import\((['"])(.+?)\1\)/, (match, p1, p2) => {
          const newPath = bustTimestamp(p2, t);
          return `import(${p1}${newPath}${p1})`;
        });
        if (newStr !== fnStr) {
          try {
            // eslint-disable-next-line no-new-func
            (lazy as any).$symbolFn$ = new Function(`return (${newStr})`)() as () => Promise<
              Record<string, any>
            >;
            didReload = true;
          } catch (err) {
            console.error(`Failed to update symbolFn for ${lazy.$symbol$}`, err);
          }
        } else {
          console.warn(
            `Couldn't find import() in symbolFn for ${lazy.$symbol$}, cannot update it for HMR`,
            fnStr
          );
        }
      }
      if (didReload) {
        lazy.$ref$ = undefined;
        (document as any).__hmrDone = (document as any).__hmrT;
        if (lazy.qrls) {
          for (const qrlRef of lazy.qrls) {
            const qrl = qrlRef.deref();
            if (qrl) {
              if (qrl.resolved) {
                qrl.resolved = undefined;
              }
            } else {
              lazy.qrls!.delete(qrlRef);
            }
          }
        }
      }
    }
  });
}

/**
 * Shared lazy-loading reference that holds module loading metadata. Multiple QRLs pointing to the
 * same chunk+symbol can share a single LazyRef, differing only in their captured scope.
 */
export class LazyRef<TYPE = unknown> {
  $container$: Container | undefined;
  // Don't allocate dev property immediately so that in prod we don't have this property
  declare dev?: QRLDev | null | undefined;
  // documenter fails on WeakRef
  declare qrls?: Set<any>;

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
      if (typeof document !== 'undefined') {
        this.qrls = new Set();
      }
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

const QRL_STATE = Symbol('qrl-state');

type QRLCallable<TYPE = unknown> = QRLInternal<TYPE> & {
  [QRL_STATE]: QRLClass<TYPE>;
};

/**
 * QRL methods may run with `this` set either to the callable wrapper or directly to the backing
 * state object. This helper normalizes both cases to the shared backing state.
 */
const getInstance = <TYPE>(instance: any): QRLClass<TYPE> => {
  return (instance?.[QRL_STATE] as QRLClass<TYPE> | undefined) ?? instance;
};

/**
 * QRL state lives in a plain object. The callable wrapper stores that state under a symbol and uses
 * a shared prototype derived from Function.prototype for methods/getters. This keeps QRLs callable
 * without using a unique state object as each function's prototype.
 */
export class QRLClass<TYPE> {
  resolved: undefined | TYPE = undefined;
  // This is defined or undefined for the lifetime of the QRL, so we set it lazily
  $captures$?: Readonly<unknown[]> | string | null;
  $container$?: Container | null;

  constructor(
    readonly $lazy$: LazyRef<TYPE>,
    $captures$?: Readonly<unknown[]> | string | null,
    container?: Container | null
  ) {
    if ($captures$) {
      this.$captures$ = $captures$;
      if (typeof $captures$ === 'string') {
        // We cannot rely on the container of the lazy ref, it may be missing or different
        this.$container$ = container;
      }
      if (qDev) {
        if ($captures$ && typeof $captures$ === 'object') {
          for (let i = 0; i < $captures$.length; i++) {
            const item = $captures$[i];
            verifySerializable(item, 'Captured variable in the closure can not be serialized');
          }
        }
      }
    }

    if (qDev && $lazy$.qrls) {
      $lazy$.qrls.add(new WeakRef(this));
    }

    // If it is plain value with deserialized or missing captures, resolve it immediately
    // Otherwise we keep using the async path so we can wait for qrls to load
    if ($lazy$.$ref$ != null && typeof this.$captures$ !== 'string' && !isPromise($lazy$.$ref$)) {
      this.resolved = bindCaptures(this, $lazy$.$ref$ as TYPE);
    }
  }
}

const qrlCallFn = function <TYPE>(
  this: QRLClass<TYPE> | QRLCallable<TYPE>,
  withThis: unknown,
  ...args: QrlArgs<TYPE>
): ValueOrPromise<QrlReturn<TYPE>> {
  const qrl = getInstance<TYPE>(this);
  if (qrl.resolved) {
    return (qrl.resolved as any).apply(withThis, args);
  }

  // Not resolved yet: we'll return a promise

  // grab the context while we are sync
  const ctx = tryGetInvokeContext();

  return qrlResolve
    .call(qrl, ctx?.$container$)
    .then(() => invokeApply.call(withThis, ctx, qrl.resolved as any, args));
};

const qrlWithCaptures = function <TYPE>(
  this: QRLClass<TYPE> | QRLCallable<TYPE>,
  captures: Readonly<unknown[]> | string | null
): QRLInternal<TYPE> {
  const qrl = getInstance<TYPE>(this);
  const newQrl = new QRLClass<TYPE>(
    qrl.$lazy$,
    captures!,
    qrl.$captures$ ? qrl.$container$ : undefined
  );
  return makeQrlFn(newQrl);
};

const qrlSetRef = function <TYPE>(
  this: QRLClass<TYPE> | QRLCallable<TYPE>,
  ref: ValueOrPromise<TYPE>
) {
  const qrl = getInstance<TYPE>(this);
  qrl.$lazy$.$setRef$(ref);
  qrl.resolved = bindCaptures(qrl, ref as TYPE);
};

const qrlResolve = async function <TYPE>(
  this: QRLClass<TYPE> | QRLCallable<TYPE>,
  container?: Container
): Promise<TYPE> {
  const qrl = getInstance<TYPE>(this);
  return maybeThen($resolve$(qrl, container), () => qrl.resolved!);
};

const qrlGetSymbol = function <TYPE>(this: QRLClass<TYPE> | QRLCallable<TYPE>): string {
  return getInstance<TYPE>(this).$lazy$.$symbol$;
};

const qrlGetHash = function <TYPE>(this: QRLClass<TYPE> | QRLCallable<TYPE>): string {
  return getInstance<TYPE>(this).$lazy$.$hash$;
};

const qrlGetCaptured = function <TYPE>(this: QRLClass<TYPE> | QRLCallable<TYPE>): unknown[] | null {
  const qrl = getInstance<TYPE>(this);
  ensureQrlCaptures(qrl);
  return qrl.$captures$ as unknown[] | null;
};

const qrlGetFn = function <TYPE>(
  this: QRLClass<TYPE> | QRLCallable<TYPE>,
  currentCtx?: InvokeContext,
  beforeFn?: () => void | false
): TYPE extends (...args: any) => any
  ? (...args: Parameters<TYPE>) => ValueOrPromise<ReturnType<TYPE> | undefined>
  : // unknown instead of never so we allow assigning function QRLs to any
    unknown {
  const qrl = getInstance<TYPE>(this);
  const bound = (...args: QrlArgs<TYPE>): unknown => {
    if (!qrl.resolved) {
      return qrlResolve.call(qrl).then((fn) => {
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
};

const QRL_FUNCTION_PROTO: QRLInternalMethods<any> = Object.create(Function.prototype, {
  resolved: {
    get(this: QRLCallable<any>) {
      return this[QRL_STATE].resolved;
    },
    set(this: QRLCallable<any>, value: unknown) {
      this[QRL_STATE].resolved = value;
    },
  },
  $captures$: {
    get(this: QRLCallable<any>) {
      return this[QRL_STATE].$captures$;
    },
    set(this: QRLCallable<any>, value: Readonly<unknown[]> | string | null | undefined) {
      this[QRL_STATE].$captures$ = value;
    },
  },
  $container$: {
    get(this: QRLCallable<any>) {
      return this[QRL_STATE].$container$;
    },
    set(this: QRLCallable<any>, value: Container | null | undefined) {
      this[QRL_STATE].$container$ = value;
    },
  },
  $lazy$: {
    get(this: QRLCallable<any>) {
      return this[QRL_STATE].$lazy$;
    },
  },
  $chunk$: {
    get(this: QRLCallable<any>) {
      return this[QRL_STATE].$lazy$.$chunk$;
    },
  },
  $symbol$: {
    get(this: QRLCallable<any>) {
      return this[QRL_STATE].$lazy$.$symbol$;
    },
  },
  $hash$: {
    get(this: QRLCallable<any>) {
      return this[QRL_STATE].$lazy$.$hash$;
    },
  },
  dev: {
    get(this: QRLCallable<any>) {
      return this[QRL_STATE].$lazy$.dev;
    },
  },
  ...(qDev
    ? {
        $setDev$: {
          value(this: QRLCallable<any>, dev: QRLDev | null) {
            this[QRL_STATE].$lazy$.dev = dev;
          },
        },
      }
    : undefined),
  $callFn$: {
    value: qrlCallFn,
  },
  w: {
    value: qrlWithCaptures,
  },
  s: {
    value: qrlSetRef,
  },
  resolve: {
    value: qrlResolve,
  },
  getSymbol: {
    value: qrlGetSymbol,
  },
  getHash: {
    value: qrlGetHash,
  },
  getCaptured: {
    value: qrlGetCaptured,
  },
  getFn: {
    value: qrlGetFn,
  },
});

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
  const captureIds = captures.split(' ');
  for (let i = 0; i < captureIds.length; i++) {
    const id = captureIds[i];
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
  const lazy = getLazyRef<TYPE>(chunk, symbol, symbolFn!, symbolRef!, container);
  const qrl = new QRLClass<TYPE>(lazy, captures!, container);

  return makeQrlFn(qrl);
};

const makeQrlFn = <TYPE>(qrl: QRLClass<TYPE>): QRLInternal<TYPE> => {
  // The QRL has to be callable, so we create a function and attach the per-instance state to it.
  const qrlFn = async function (this: unknown, ...args: QrlArgs<TYPE>) {
    return qrlCallFn.call(qrlFn as QRLCallable<TYPE>, this, ...args);
  } as QRLCallable<TYPE>;
  qrlFn[QRL_STATE] = qrl;
  Object.setPrototypeOf(qrlFn, QRL_FUNCTION_PROTO);
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
