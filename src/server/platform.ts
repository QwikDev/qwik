import type { CorePlatform } from '@builder.io/qwik';
import { setPlatform, __internal_qHookMap } from '@builder.io/qwik';
import { qExport } from '../core/import/qImport';
import type { DocumentOptions } from './types';

const _setInmediate = typeof setImmediate === 'function' ? setImmediate : setTimeout;
const _nextTick = typeof queueMicrotask === 'function' ? queueMicrotask : process.nextTick;

function createPlatform(document: Document, _opts?: DocumentOptions) {
  if (!document || (document as Document).nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }
  let queuePromise: Promise<any> | null;

  const doc: Document = document;
  const serverPlatform: CorePlatform = {
    async importSymbol(_, url) {
      await Promise.resolve(); // wait one microtask
      const symbolName = qExport(url.toString());
      const symbolFn = __internal_qHookMap.get(symbolName);
      console.log('importSymbol', symbolName, symbolFn);
      const module = await symbolFn();
      return module[symbolName];
    },
    queueRender: (renderMarked) => {
      if (!queuePromise) {
        queuePromise = new Promise((resolve, reject) =>
          // Do not use process.nextTick, as this will execute at same priority as promises.
          // We need to execute after promisees.
          _setInmediate(() => {
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
        _nextTick(() => {
            queuePromise = null;
            flushStore(doc).then(resolve, reject);
          })
        );
      }
      return queuePromise;
    },
  };
  return serverPlatform;
}

/**
 * Applies NodeJS specific platform APIs to the passed in document instance.
 * @public
 */
export async function setServerPlatform(document: any, opts: DocumentOptions) {
  const platform = createPlatform(document, opts);
  setPlatform(document, platform);
}
