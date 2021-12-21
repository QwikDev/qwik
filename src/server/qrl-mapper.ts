import type { OutputEntryMap } from '@builder.io/qwik/optimizer';
import type { QrlMapper } from './types';

/**
 * Parses the QRL mapping JSON and returns the transform closure.
 * @alpha
 */
export function createQrlMapper(qEntryMap: OutputEntryMap) {
  const symbolManifest = new Map<string, string>();

  const qrlMapper: QrlMapper = (path, symbolName) => {
    path = symbolManifest.get(symbolName) || path;
    path = path.slice(0, path.lastIndexOf('.'));
    return `./${path}#${symbolName}`;
  };

  for (const symbolName in qEntryMap.mapping) {
    const chunkName = qEntryMap.mapping[symbolName];
    symbolManifest.set(symbolName, chunkName);
  }

  return qrlMapper;
}

/**
 * Read the QRL mapping JSON and returns the transform closure.
 * @alpha
 */
 export async function readQrlMapper(symbolsPath: string) {
  const { readFile } = await import('fs');

  const mapContentPromise = new Promise<string>((resolve, reject) => {
    readFile(symbolsPath, 'utf-8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
  const qEntryMap: OutputEntryMap = JSON.parse(await mapContentPromise);
  return createQrlMapper(qEntryMap);
}
