import { setPlatform } from '@qwik.dev/core';
import { isDev } from '@qwik.dev/core/build';
import type { ResolvedManifest, SymbolMapperFn } from '@qwik.dev/core/optimizer';
import { QError, qError, SYNC_QRL, type CorePlatformServer } from './qwik-copy';
import type { SymbolMapper } from '@qwik.dev/core/optimizer';
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
  parent?: string,
  chunk?: string | null
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
      return [symbolName, `${import.meta.env?.BASE_URL}@qwik-handlers`];
    }
    // library qrls bake their chunk in — never fabricate over it
    if (chunk) {
      return [symbolName, chunk];
    }
    console.error('qwik symbolMapper: unknown qrl requested without parent:', symbolName);
    return [symbolName, `${import.meta.env?.BASE_URL}${symbolName}.js`];
  }
  // In dev mode, the `parent` is the Vite URL for the parent, not the real absolute path.
  // It is always absolute but when on Windows that's without a /
  const qrlFile = `${import.meta.env?.BASE_URL}${parent.startsWith('/') ? parent.slice(1) : parent}_${symbolName}.js`;
  return [symbolName, qrlFile];
};

export function createPlatform(
  opts: SerializeDocumentOptions,
  resolvedManifest: ResolvedManifest | undefined
) {
  const mapper = resolvedManifest?.mapper;
  const mapFromManifest = (
    symbolName: string,
    chunk: string | null,
    parent?: string
  ): readonly [string, string] | undefined => {
    if (mapper || (isDev && import.meta.env?.MODE !== 'test')) {
      const hash = getSymbolHash(symbolName);
      const result = !isDev
        ? mapper![hash]
        : getDevSegmentPath(mapper, hash, symbolName, parent, chunk);
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
      // we never lazy import QRLs on the server
      throw qError(QError.dynamicImportFailed, [symbolName]);
    },
    raf: () => {
      console.error('server can not rerender');
      return Promise.resolve();
    },
    chunkForSymbol(symbolName, chunk, parent) {
      // a caller-supplied SymbolMapperFn takes the manifest mapper; ours takes the chunk
      return opts.symbolMapper
        ? opts.symbolMapper(symbolName, mapper, parent)
        : mapFromManifest(symbolName, chunk, parent);
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
