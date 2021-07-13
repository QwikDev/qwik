import type { CorePlatform } from '@builder.io/qwik';
import { setPlatform } from '@builder.io/qwik';
import type { DocumentOptions } from './types';
import { join } from 'path';

/**
 * Applies NodeJS specific platform APIs to the passed in document instance.
 * @public
 */
export function setServerPlatform(document: any, opts: DocumentOptions) {
  if (!document || (document as Document).nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }
  let queuePromise: Promise<any> | null;

  const doc: Document = document;
  const serverPlatform: CorePlatform = {
    import: async (url: string) => {
      const m = await import(url);
      return m;
    },
    toPath: (url: URL) => {
      if (!opts.outDir) {
        throw new Error(`Server platform missing "outDir"`);
      }
      const pathname = url.pathname + '.js';
      const filePath = join(opts.outDir, pathname);
      return filePath;
    },
    queueRender: (renderMarked) => {
      if (!queuePromise) {
        queuePromise = new Promise((resolve, reject) =>
          process.nextTick(() => {
            queuePromise = null;
            renderMarked(doc).then(resolve, reject);
          })
        );
      }
      return queuePromise;
    },
  };

  setPlatform(doc, serverPlatform);
}
