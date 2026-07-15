import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getSymbolHash } from '../core/shared/qrl/qrl-utils';
import type { TestPlatform } from './types';

const extensions = ['.ts', '.tsx', '.js', '.cjs', '.mjs', '.jsx'];

const toPath = (url: URL) => {
  url.hash = '';
  url.search = '';
  if (url.protocol !== 'file:') {
    throw new Error(`Only file: protocol is supported in tests, got: ${url.href}`);
  }
  const path = fileURLToPath(url);
  for (const candidate of [path, ...extensions.map((extension) => path + extension)]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to find path for import "${url}"`);
};

const platform: TestPlatform = {
  isServer: false,
  importSymbol(container, url, symbol) {
    const registered = (globalThis as any).__qwik_reg_symbols?.get(getSymbolHash(symbol));
    if (registered) {
      return registered;
    }
    if (!container || !url) {
      throw new Error(`Unable to import symbol "${symbol}" without a container and URL.`);
    }
    const base = new URL(container.getAttribute('q:base') ?? container.ownerDocument.baseURI);
    return import(toPath(new URL(url, base))).then((module) => module[symbol]);
  },
  raf: (fn) => new Promise((resolve) => setTimeout(() => resolve(fn()))),
  flush: async () => {
    await Promise.resolve();
  },
  chunkForSymbol: () => undefined,
};

/** @public */
export const getTestPlatform = (): TestPlatform => platform;
