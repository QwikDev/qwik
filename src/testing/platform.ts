import { getPlatform, setPlatform } from '@builder.io/qwik';
import type { TestPlatform } from './types';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

function createPlatform(document: any) {
  if (!document || (document as Document).nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }

  const doc: Document = document;

  interface Queue<T> {
    fn: (doc: Document) => Promise<T>;
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (value: any) => void;
  }

  let render: Queue<any> | null = null;
  let store: Queue<any> | null = null;

  const moduleCache = new Map<string, { [symbol: string]: any }>();
  const testPlatform: TestPlatform = {
    importSymbol(element, url, symbolName) {
      const urlDoc = toUrl(element.ownerDocument, element, url);
      const importPath = toPath(urlDoc);
      const mod = moduleCache.get(importPath);
      if (mod) {
        return mod[symbolName];
      }
      return import(importPath).then((mod) => {
        moduleCache.set(importPath, mod);
        return mod[symbolName];
      });
    },
    queueRender: (renderMarked) => {
      if (!render) {
        render = {
          fn: renderMarked,
          promise: null!,
          resolve: null!,
          reject: null!,
        };
        render.promise = new Promise((resolve, reject) => {
          render!.resolve = resolve;
          render!.reject = reject;
        });
      } else if (renderMarked !== render.fn) {
        // TODO(misko): proper error and test
        throw new Error('Must be same function');
      }
      return render.promise;
    },
    queueStoreFlush: (storeFlush) => {
      if (!store) {
        store = {
          fn: storeFlush,
          promise: null!,
          resolve: null!,
          reject: null!,
        };
        store.promise = new Promise((resolve, reject) => {
          store!.resolve = resolve;
          store!.reject = reject;
        });
      } else if (storeFlush !== store.fn) {
        // TODO(misko): proper error and test
        throw new Error('Must be same function');
      }
      return store.promise;
    },
    flush: async () => {
      await Promise.resolve();

      if (store) {
        try {
          store.resolve(await store.fn(doc));
        } catch (e) {
          store.reject(e);
        }
        store = null;
      }

      if (render) {
        try {
          render.resolve(await render.fn(doc));
        } catch (e) {
          render.reject(e);
        }
        store = null;
      }
    },
  };
  return testPlatform;
}

export function setTestPlatform(document: any) {
  const platform = createPlatform(document);
  setPlatform(document, platform);
}

/**
 * Convert relative base URI and relative URL into a fully qualified URL.
 *
 * @param base -`QRL`s are relative, and therefore they need a base for resolution.
 *    - `Element` use `base.ownerDocument.baseURI`
 *    - `Document` use `base.baseURI`
 *    - `string` use `base` as is
 *    - `QConfig` use `base.baseURI`
 * @param url - relative URL
 * @returns fully qualified URL.
 */
export function toUrl(doc: Document, element: Element | null, url?: string | URL): URL {
  let _url: string | URL;
  let _base: string | URL | undefined = undefined;

  if (url === undefined) {
    //  recursive call
    if (element) {
      _url = element.getAttribute('q:base')!;
      _base = toUrl(
        doc,
        element.parentNode && (element.parentNode as HTMLElement).closest('[q\\:base]')
      );
    } else {
      _url = doc.baseURI;
    }
  } else if (url) {
    (_url = url), (_base = toUrl(doc, element!.closest('[q\\:base]')));
  } else {
    throw new Error('INTERNAL ERROR');
  }
  return new URL(String(_url), _base);
}

function toPath(url: URL) {
  const normalizedUrl = new URL(String(url));
  normalizedUrl.hash = '';
  normalizedUrl.search = '';
  const path = fileURLToPath(String(normalizedUrl));
  const importPaths = [path, ...testExts.map((ext) => path + ext)];

  for (const importPath of importPaths) {
    if (existsSync(importPath)) {
      return importPath;
    }
  }

  throw new Error(`Unable to find path for import "${url}"`);
}

export function getTestPlatform(document: any) {
  const testPlatform: TestPlatform = getPlatform(document) as any;
  if (!testPlatform) {
    throw new Error(`Test platform was not applied to the document`);
  }
  if (typeof testPlatform.flush !== 'function') {
    throw new Error(`Invalid Test platform applied to the document`);
  }
  return testPlatform;
}

const testExts = ['.ts', '.tsx', '.js', '.cjs', '.mjs', '.jsx'];
