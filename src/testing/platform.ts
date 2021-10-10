import { getPlatform, setPlatform } from '@builder.io/qwik';
import type { TestPlatform } from './types';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

export function setTestPlatform(document: any) {
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

  const testPlatform: TestPlatform = {
    import: (url: string) => import(url),
    toPath: (url: URL) => {
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

  setPlatform(doc, testPlatform);
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
