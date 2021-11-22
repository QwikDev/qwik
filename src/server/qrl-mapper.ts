import type { OutputEntryMap } from '@builder.io/qwik/optimizer';
import type { QrlMapper } from './types';
import { readFile } from './utils';

export async function createQrlMapper(entryMapPath: string) {
  const mapContent = await readFile(entryMapPath, 'utf-8');

  const qEntryMap: OutputEntryMap = JSON.parse(mapContent);
  const symbolManifest = new Map<string, string>();

  const qrlMapper: QrlMapper = (path, symbol) => {
    path = symbolManifest.get(symbol.toLocaleLowerCase()) || path;
    return `./${path}#${symbol}`;
  };

  for (const key in qEntryMap.mapping) {
    if (Object.prototype.hasOwnProperty.call(qEntryMap.mapping, key)) {
      const chunkNameWithExt = qEntryMap.mapping[key];
      const chunkName = chunkNameWithExt.substr(0, chunkNameWithExt.length - 3);
      const symbol = key.split('h_components.qwik_')[1]!;
      symbolManifest.set(symbol, chunkName);
    }
  }

  return qrlMapper;
}
