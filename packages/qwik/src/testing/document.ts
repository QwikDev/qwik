import type { MockDocumentOptions } from './types';
import { JSDOM } from 'jsdom';
import { normalizeUrl } from './util';

/**
 * Create emulated `Document` for server environment. Does not implement the full browser `document`
 * and `window` API. This api may be removed in the future.
 *
 * @public
 */
export function createDocument(opts: MockDocumentOptions = {}) {
  return createWindow(opts).document;
}

/**
 * Create emulated `window` useful for testing.
 *
 * @public
 */
export function createWindow(opts: MockDocumentOptions = {}) {
  const { window } = new JSDOM(opts.html || '<!DOCTYPE html>', {
    url: typeof opts.url === 'string' ? opts.url : opts.url?.href,
    runScripts: 'dangerously',
    contentType: 'text/html; charset=utf-8',
    pretendToBeVisual: true,
  });
  // Our backchannel for QRLs during testing
  const map = ((globalThis as any)['mock-chunk'] ||= new Map());
  window['mock-chunk'] = map;
  return window;
}

export function ensureGlobals(doc: any, opts?: MockDocumentOptions) {
  if (doc && doc[QWIK_DOC]) {
    return doc.defaultView;
  }

  if (!doc || doc.nodeType !== 9) {
    console.error('Invalid document', doc);
    throw new Error(`Invalid document`);
  }

  doc[QWIK_DOC] = true;

  const loc = normalizeUrl(opts?.url);

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

  return doc.defaultView;
}

const noop = () => {};

const QWIK_DOC = Symbol();
