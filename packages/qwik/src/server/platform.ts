import type { SerializeDocumentOptions, SymbolMapper } from './types';
import type { CorePlatform } from '@builder.io/qwik';
import { setPlatform } from '@builder.io/qwik';

declare const require: (module: string) => Record<string, any>;

function createPlatform(
  document: any,
  opts: SerializeDocumentOptions,
  mapper: SymbolMapper | undefined
) {
  if (!document || (document as Document).nodeType !== 9) {
    throw new Error(`Invalid Document implementation`);
  }
  const mapperFn = opts.symbolMapper
    ? opts.symbolMapper
    : (symbolName: string) => {
        if (mapper) {
          const hash = getSymbolHash(symbolName);
          const result = mapper[hash];
          if (!result) {
            console.error('Cannot resolve symbol', symbolName, 'in', mapper);
          }
          return result;
        }
      };

  const serverPlatform: CorePlatform = {
    isServer: true,
    async importSymbol(_element, qrl, symbolName) {
      let [modulePath] = String(qrl).split('#');
      if (!modulePath.endsWith('.js')) {
        modulePath += '.js';
      }
      const module = require(modulePath); // eslint-disable-line  @typescript-eslint/no-var-requires
      if (!(symbolName in module)) {
        throw new Error(`Q-ERROR: missing symbol '${symbolName}' in module '${modulePath}'.`);
      }
      const symbol = module[symbolName];
      return symbol;
    },
    raf: () => {
      console.error('server can not rerender');
      return Promise.resolve();
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
      return mapperFn(symbolName, mapper);
    },
  };
  return serverPlatform;
}

/**
 * Applies NodeJS specific platform APIs to the passed in document instance.
 *
 * @alpha
 *
 */
export async function setServerPlatform(
  document: any,
  opts: SerializeDocumentOptions,
  mapper: SymbolMapper | undefined
) {
  const platform = createPlatform(document, opts, mapper);
  setPlatform(document, platform);
}

export const getSymbolHash = (symbolName: string) => {
  const index = symbolName.lastIndexOf('_');
  if (index > -1) {
    return symbolName.slice(index + 1);
  }
  return symbolName;
};
