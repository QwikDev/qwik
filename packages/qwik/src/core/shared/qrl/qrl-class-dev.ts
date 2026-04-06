/**
 * Dev-only code for qrl-class.ts: HMR support, capture validation, and dev property initialization.
 * This file is always imported but all code paths are guarded by `qDev` or `isBrowser &&
 * import.meta.hot`.
 */
import { isBrowser } from '@qwik.dev/core/build';
import { verifySerializable } from '../serdes/verify';
import type { LazyRef, QRLClass } from './qrl-class';

/** Initialize dev properties on a LazyRef instance. */
export const initLazyRefDev = (lazy: LazyRef): void => {
  lazy.dev = null;
  if (typeof document !== 'undefined') {
    lazy.qrls = new Set();
  }
};

/** Validate captured scope and register WeakRef tracking on a QRLClass instance. */
export const initQrlClassDev = (
  lazy: LazyRef,
  captures: Readonly<unknown[]> | string | null | undefined,
  qrl: QRLClass<any>
): void => {
  if (captures && typeof captures === 'object') {
    for (let i = 0; i < captures.length; i++) {
      const item = captures[i];
      verifySerializable(item, 'Captured variable in the closure can not be serialized');
    }
  }
  if (lazy.qrls) {
    lazy.qrls.add(new WeakRef(qrl));
  }
};

/** Set up HMR support: cache LazyRefs and invalidate on file changes. */
export const setupHmr = (
  LazyRefClass: typeof LazyRef,
  setGetLazyRef: (
    fn: <TYPE>(
      chunk: string | null,
      symbol: string,
      symbolFn: null | (() => Promise<Record<string, TYPE>>),
      ref: import('../utils/types').ValueOrPromise<TYPE> | undefined,
      container: import('../types').Container | undefined
    ) => LazyRef<TYPE>
  ) => void
): void => {
  if (!(isBrowser && import.meta.hot)) {
    return;
  }

  const allLazyRefs = new Map<string, LazyRef<any>>();

  setGetLazyRef((chunk, symbol, symbolFn, ref, container) => {
    let lazyRef = allLazyRefs.get(symbol);
    if (!lazyRef) {
      lazyRef = new LazyRefClass(chunk, symbol, symbolFn, ref, container);
      // Ignore sync QRLs
      if (chunk !== '') {
        allLazyRefs.set(symbol, lazyRef);
      }
    }
    return lazyRef;
  });

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
    for (const lazy of allLazyRefs.values()) {
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
};
