import type { OutputEntryMap } from '@builder.io/qwik/optimizer';
import type { QrlMapper } from './types';
import { readFile } from './utils';

export async function createQrlMapper(entryMapPath: string) {
  const mapContent = await readFile(entryMapPath, 'utf-8');

  const qEntryMap: OutputEntryMap = JSON.parse(mapContent);
  const symbolManifest = new Map<string, string>();

  const qrlMapper: QrlMapper = (path, symbolName) => {
    path = symbolManifest.get(symbolName) || path;
    return `./${path}#${symbolName}`;
  };

  for (const symbolName in qEntryMap.mapping) {
    const chunkName = qEntryMap.mapping[symbolName];
    symbolManifest.set(symbolName, chunkName);
  }

  return qrlMapper;
}
