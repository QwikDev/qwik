import type { CorePlatform } from '@builder.io/qwik';
import { setPlatform } from '@builder.io/qwik';
import type { DocumentOptions } from './types';
import { extname, isAbsolute, resolve } from 'path';

/**
 * Applies NodeJS specific platform APIs to the passed in document instance.
 * @public
 */
export function setServerPlatform(document: any, opts: DocumentOptions) {
  if (!document || (document as Document).nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }
  let queuePromise: Promise<any> | null;

  const serverDir = opts.serverDir;
  if (serverDir == null) {
    throw new Error(`Server platform missing "serverDir"`);
  }
  if (!isAbsolute(serverDir)) {
    throw new Error(`serverDir "${serverDir}" must be an absolute path`);
  }

  const doc: Document = document;
  const serverPlatform: CorePlatform = {
    import: async (url: string) => {
      const m = await import(url);
      return m;
    },
    toPath: (url: URL) => {
      const ext = extname(url.pathname);
      const hasJsExt = JS_EXTS[ext];
      const urlPathname = hasJsExt ? url.pathname : url.pathname + '.js';
      const relativeUrlPathname = urlPathname.substring(1);
      const filePath = resolve(serverDir, relativeUrlPathname);
      return filePath;
    },
    queueRender: (renderMarked) => {
      if (!queuePromise) {
        queuePromise = new Promise((resolve, reject) =>
          // Do not use process.nextTick, as this will execute at same priority as promises.
          // We need to execute after promisees.
          setImmediate(() => {
            queuePromise = null;
            renderMarked(doc).then(resolve, reject);
          })
        );
      }
      return queuePromise;
    },
    queueStoreFlush: (flushStore) => {
      if (!queuePromise) {
        queuePromise = new Promise((resolve, reject) =>
          process.nextTick(() => {
            queuePromise = null;
            flushStore(doc).then(resolve, reject);
          })
        );
      }
      return queuePromise;
    },
  };

  setPlatform(doc, serverPlatform);
}

const JS_EXTS: { [ext: string]: boolean } = {
  '.js': true,
  '.cjs': true,
  '.mjs': true,
  '': false,
};
