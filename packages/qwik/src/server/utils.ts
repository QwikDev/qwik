import { getValidManifest } from '../optimizer/src/manifest';
import type { DocumentOptions, QwikManifest, RenderToDocumentOptions } from './types';

/**
 * Utility timer function for performance profiling.
 * Returns a duration of 0 in environments that do not support performance.
 * @alpha
 */
export function createTimer() {
  if (typeof performance === 'undefined') {
    return () => 0;
  }
  const start = performance.now();
  return () => {
    const end = performance.now();
    const delta = end - start;
    return delta / 1000000;
  };
}

export function ensureGlobals(doc: any, opts: DocumentOptions) {
  if (!doc[QWIK_DOC]) {
    if (!doc || doc.nodeType !== 9) {
      throw new Error(`Invalid document`);
    }

    doc[QWIK_DOC] = true;

    const loc = normalizeUrl(opts.url);

    Object.defineProperty(doc, 'baseURI', {
      get: () => loc.href,
      set: (url: string) => (loc.href = normalizeUrl(url).href),
    });

    doc.defaultView = {
      get document() {
        return doc;
      },
      get location() {
        return loc;
      },
      get origin() {
        return loc.origin;
      },
      addEventListener: noop,
      removeEventListener: noop,
      history: {
        pushState: noop,
        replaceState: noop,
        go: noop,
        back: noop,
        forward: noop,
      },
      CustomEvent: class CustomEvent {
        type: string;
        constructor(type: string, details: any) {
          Object.assign(this, details);
          this.type = type;
        }
      },
    };
  }

  return doc.defaultView;
}

const QWIK_DOC = Symbol();

export function normalizeUrl(url: string | URL | undefined | null) {
  if (url != null) {
    if (typeof url === 'string') {
      return new URL(url || '/', BASE_URI);
    }
    if (typeof url.href === 'string') {
      return new URL(url.href || '/', BASE_URI);
    }
  }
  return new URL(BASE_URI);
}

const BASE_URI = `http://document.qwik.dev/`;

const noop = () => {};

export function getQrlMap(manifest: QwikManifest | undefined | null) {
  manifest = getValidManifest(manifest);
  if (manifest) {
    return manifest.mapping;
  }
  return undefined;
}

export function getBuildBase(opts: RenderToDocumentOptions) {
  let base = opts.base;
  if (typeof base === 'string') {
    if (!base.endsWith('/')) {
      base += '/';
    }
    return base;
  }
  return null;
}

/**
 * @public
 */
export const versions = {
  qwik: (globalThis as any).QWIK_VERSION as string,
  qwikDom: (globalThis as any).QWIK_DOM_VERSION as string,
} as const;
