import { setPlatform } from '@qwik.dev/core';
import { isDev } from '@qwik.dev/core/build';
import type { ResolvedManifest, SymbolMapperFn } from '@qwik.dev/core/optimizer';
import { SYNC_QRL } from './qwik-copy';
import type { CorePlatformServer, SymbolMapper } from './qwik-types';
import type { SerializeDocumentOptions } from './types';

declare const require: (module: string) => Record<string, any>;

/**
 * In dev mode, we create predicatable QRL segment filenames so we can recover the parent path in
 * the vite plugin, because we don't have a manifest
 */
const getDevSegmentPath = (
  mapper: SymbolMapper | undefined,
  hash: string,
  symbolName: string,
  parent?: string
): ReturnType<SymbolMapperFn> => {
  const existing = mapper?.[hash];
  if (existing) {
    return existing;
  }
  if (symbolName === SYNC_QRL) {
    return [symbolName, ''];
  }
  if (!parent) {
    // Core symbols
    if (symbolName.startsWith('_') && symbolName.length < 6) {
      return [symbolName, `${import.meta.env.BASE_URL}@qwik-handlers`];
    }
    console.error('qwik symbolMapper: unknown qrl requested without parent:', symbolName);
    return [symbolName, `${import.meta.env.BASE_URL}${symbolName}.js`];
  }
  // In dev mode, the `parent` is the Vite URL for the parent, not the real absolute path.
  // It is always absolute but when on Windows that's without a /
  const qrlFile = `${import.meta.env.BASE_URL}${parent.startsWith('/') ? parent.slice(1) : parent}_${symbolName}.js`;
  return [symbolName, qrlFile];
};

export function createPlatform(
  opts: SerializeDocumentOptions,
  resolvedManifest: ResolvedManifest | undefined
) {
  const mapper = resolvedManifest?.mapper;
  const mapperFn = opts.symbolMapper
    ? opts.symbolMapper
    : (symbolName: string, _chunk: any, parent?: string): readonly [string, string] | undefined => {
        if (mapper || (isDev && import.meta.env.MODE !== 'test')) {
          const hash = getSymbolHash(symbolName);
          const result = !isDev
            ? mapper![hash]
            : getDevSegmentPath(mapper, hash, symbolName, parent);
          if (!result) {
            if (hash === SYNC_QRL) {
              return [hash, ''] as const;
            }
            const isRegistered = (globalThis as any).__qwik_reg_symbols?.has(hash);
            if (isRegistered) {
              return [symbolName, '_'] as const;
            }
            console.error('Cannot resolve symbol', symbolName, 'in', mapper, parent);
          }
          return result;
        }
      };

  const serverPlatform: CorePlatformServer = {
    isServer: true,
    async importSymbol(_containerEl, url, symbolName) {
      const hash = getSymbolHash(symbolName);
      const regSym = (globalThis as any).__qwik_reg_symbols?.get(hash);
      if (regSym) {
        return regSym;
      }

      let modulePath = String(url);
      if (!modulePath.endsWith('.js')) {
        modulePath += '.js';
      }
      const module = require(modulePath);
      if (!(symbolName in module)) {
        throw new Error(`Q-ERROR: missing symbol '${symbolName}' in module '${modulePath}'.`);
      }
      return module[symbolName];
    },
    raf: () => {
      console.error('server can not rerender');
      return Promise.resolve();
    },
    chunkForSymbol(symbolName: string, _chunk, parent) {
      return mapperFn(symbolName, mapper, parent);
    },
  };
  return serverPlatform;
}

/** Applies NodeJS specific platform APIs to the passed in document instance. */
export async function setServerPlatform(
  opts: SerializeDocumentOptions,
  manifest: ResolvedManifest | undefined
) {
  const platform = createPlatform(opts, manifest);
  setPlatform(platform);
}

export const getSymbolHash = (symbolName: string) => {
  const index = symbolName.lastIndexOf('_');
  if (index > -1) {
    return symbolName.slice(index + 1);
  }
  return symbolName;
};
