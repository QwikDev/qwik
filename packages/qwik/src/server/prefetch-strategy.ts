import type { ResolvedManifest } from '@qwik.dev/core/optimizer';
import { getPlatform } from '@qwik.dev/core';
import { getQueue, preload, resetQueue } from './qwik-copy';
import { getSymbolHash } from './platform';
import { flattenPrefetchResources } from './prefetch-utils';
import type { QRLInternal } from './qwik-types';
import type { RenderToStringOptions } from './types';

const getBundles = (qrls: QRLInternal[]) => {
  const platform = getPlatform();
  return qrls
    ?.map((qrl) => {
      const symbol = qrl.$symbol$;
      const chunk = qrl.$chunk$;
      const result = platform.chunkForSymbol(symbol, chunk, qrl.dev?.file);
      if (result) {
        return result[1];
      }
      return chunk;
    })
    .filter(Boolean) as string[];
};
/** Returns paths to preload relative to the buildBase, with probabilities */
export function getPreloadPaths(
  qrls: QRLInternal[],
  opts: RenderToStringOptions,
  resolvedManifest: ResolvedManifest | undefined
): string[] {
  const prefetchStrategy = opts.prefetchStrategy;
  if (prefetchStrategy === null) {
    return [];
  }
  if (!resolvedManifest?.manifest.bundleGraph) {
    return getBundles(qrls);
  }

  // TODO should we deprecate this?
  if (typeof prefetchStrategy?.symbolsToPrefetch === 'function') {
    // call user option symbolsToPrefetch()
    try {
      const prefetchResources = prefetchStrategy.symbolsToPrefetch({
        manifest: resolvedManifest.manifest,
      });
      return flattenPrefetchResources(prefetchResources);
    } catch (e) {
      console.error('getPrefetchUrls, symbolsToPrefetch()', e);
    }
  }

  // If we have a bundle graph, all we need is the symbols
  const symbols = new Set<string>();
  for (const qrl of qrls) {
    const symbol = getSymbolHash(qrl.$symbol$);
    if (symbol && symbol.length >= 10) {
      symbols.add(symbol);
    }
  }
  return [...symbols];
}

export const expandBundles = (names: string[], resolvedManifest?: ResolvedManifest) => {
  if (!resolvedManifest?.manifest.bundleGraph) {
    return [8, ...new Set(names)];
  }

  resetQueue();

  let probability = 0.99;
  for (const name of names) {
    preload(name, probability);
    // later symbols have less probability
    probability *= 0.95;
  }

  return getQueue();
};
