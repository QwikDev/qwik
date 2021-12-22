import type { CorePlatform } from '@builder.io/qwik';
import { setPlatform, __internal_qHookMap } from '@builder.io/qwik';
import { qExport } from '../core/import/qImport';
import type { DocumentOptions } from './types';

const _setInmediate = typeof setImmediate === 'function' ? setImmediate : setTimeout;
const _nextTick = typeof queueMicrotask === 'function' ? queueMicrotask : process.nextTick;

function createPlatform(document: Document, opts?: DocumentOptions) {
  if (!document || (document as Document).nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }
  let queuePromise: Promise<any> | null;

  if (opts?.url) {
    document.location.href = opts.url;
  }
  const doc: Document = document;
  const symbolCache = new Map<string, { [symbol: string]: any }>();
  const serverPlatform: CorePlatform = {
    importSymbol(_, url) {
      const symbolName = qExport(url.toString());
      const symbol = symbolCache.get(symbolName);
      if (symbol) {
        return symbol;
      }
      const symbolFn = __internal_qHookMap.get(symbolName);
      return symbolFn().then((s: any) => {
        symbolCache.set(symbolName, s);
        return s;
      });
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
