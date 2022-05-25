import type { CorePlatform } from '@builder.io/qwik';
import { setPlatform } from '@builder.io/qwik';
import { getValidManifest } from '../optimizer/src/manifest';
import type { SerializeDocumentOptions } from './types';
import { normalizeUrl } from './utils';

const _setImmediate = typeof setImmediate === 'function' ? setImmediate : setTimeout;

declare const require: (module: string) => Record<string, any>;

function createPlatform(document: any, opts: SerializeDocumentOptions) {
  if (!document || (document as Document).nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }
  const doc: Document = document;

  let qrlMap: { [symbolName: string]: string } | undefined = undefined;

  const manifest = getValidManifest(opts.manifest);
  if (manifest) {
    // we received a valid manifest
    qrlMap = manifest.mapping;
  }

  if (opts?.url) {
    doc.location.href = normalizeUrl(opts.url).href;
  }

  const serverPlatform: CorePlatform = {
    isServer: true,
    async importSymbol(_element, qrl, symbolName) {
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
    raf: (fn) => {
      return new Promise((resolve) => {
        // Do not use process.nextTick, as this will execute at same priority as promises.
        // We need to execute after promises.
        _setImmediate(() => {
          resolve(fn());
        });
      });
    },
    nextTick: (fn) => {
      return new Promise((resolve) => {
        // Do not use process.nextTick, as this will execute at same priority as promises.
        // We need to execute after promises.
        setTimeout(() => {
          resolve(fn());
        });
      });
    },
    chunkForSymbol(symbolName: string) {
      if (qrlMap) {
        // TODO: Improve qrl map lookup
        return [qrlMap[symbolName], symbolName];
      }
      return undefined;
    },
  };
  return serverPlatform;
}

/**
 * Applies NodeJS specific platform APIs to the passed in document instance.
 * @public
 */
export async function setServerPlatform(document: any, opts: SerializeDocumentOptions) {
  const platform = createPlatform(document, opts);
  setPlatform(document, platform);
}
