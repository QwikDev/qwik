import { setPlatform } from '@qwik.dev/core';
import { _deserialize } from '@qwik.dev/core/internal';

const getSymbolHash = (symbolName) => {
  const index = symbolName.lastIndexOf('_');
  return index > -1 ? symbolName.slice(index + 1) : symbolName;
};

const createWorkerPlatform = (qrlBaseUrl) => {
  return {
    isServer: true,
    async importSymbol(_containerEl, url, symbolName) {
      const hash = getSymbolHash(symbolName);
      const regSym = globalThis.__qwik_reg_symbols?.get(hash);
      if (regSym) {
        return regSym;
      }

      if (!url || !qrlBaseUrl) {
        throw new Error(`Dynamic import ${symbolName} not found`);
      }

      const module = await import(/* @vite-ignore */ new URL(url, qrlBaseUrl).href);
      const symbol = module[symbolName] ?? globalThis.__qwik_reg_symbols?.get(hash);
      if (symbol === undefined) {
        throw new Error(`Dynamic import ${symbolName} not found`);
      }
      return symbol;
    },
    raf: () => Promise.resolve(),
    chunkForSymbol(symbolName, chunk) {
      return [symbolName, chunk ?? '_'];
    },
  };
};

export const createBrowserWorkerPlatform = (qrlBaseUrl) => {
  return createWorkerPlatform(qrlBaseUrl);
};

export const createNodeWorkerPlatform = (qrlBaseUrl) => {
  return createWorkerPlatform(qrlBaseUrl);
};

export const setBrowserWorkerPlatform = (qrlBaseUrl) => {
  setPlatform(createBrowserWorkerPlatform(qrlBaseUrl));
};

export const setNodeWorkerPlatform = (qrlBaseUrl) => {
  setPlatform(createNodeWorkerPlatform(qrlBaseUrl));
};

export const runWorkerMessage = async (data, postMessage, invokeThis) => {
  const requestId = data[0];
  try {
    const [qrl, ...args] = _deserialize(data[1]);

    const output = await qrl.apply(invokeThis ?? null, args);
    postMessage([requestId, true, output]);
  } catch (err) {
    postMessage([requestId, false, err]);
  }
};
