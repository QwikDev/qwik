import type { CorePlatform } from '@builder.io/qwik';
import { setPlatform } from '@builder.io/qwik';
import type { DocumentOptions } from './types';

const _setImmediate = typeof setImmediate === 'function' ? setImmediate : setTimeout;
const _nextTick = typeof queueMicrotask === 'function' ? queueMicrotask : process.nextTick;

declare const require: (module: string) => Record<string, any>;

function createPlatform(document: any, opts?: DocumentOptions) {
  if (!document || (document as Document).nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }
  let queuePromise: Promise<any> | null;
  const doc: Document = document;

  if (opts?.url) {
    doc.location.href = opts.url.href;
  }
  const serverPlatform: CorePlatform = {
    async importSymbol(element, qrl, symbolName) {
      let [modulePath] = String(qrl).split('#');
      if (!modulePath.endsWith('.js')) {
        modulePath += '.js';
      }
      const module = require(modulePath); // eslint-disable-line  @typescript-eslint/no-var-requires
      const symbol = module[symbolName];
      if (!symbol) {
        throw new Error(`Q-ERROR: missing symbol '${symbolName}' in module '${modulePath}'.`);
      }
      return symbol;
    },
    queueRender: (renderMarked) => {
      if (!queuePromise) {
        queuePromise = new Promise((resolve, reject) =>
          // Do not use process.nextTick, as this will execute at same priority as promises.
          // We need to execute after promisees.
          _setImmediate(() => {
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
