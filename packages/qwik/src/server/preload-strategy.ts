import type { ResolvedManifest } from '@builder.io/qwik/optimizer';
import { getQueue, preload, resetQueue } from '../core/preloader/queue';
import type { QRLInternal } from '../core/qrl/qrl-class';
import { flattenPrefetchResources } from './preload-utils';
import type { RenderToStringOptions, SnapshotResult } from './types';
import { getPlatform } from '@builder.io/qwik';
import { getSymbolHash } from './platform';

const getBundles = (snapshotResult: SnapshotResult | null) => {
  const platform = getPlatform();
  return (snapshotResult?.qrls as QRLInternal[])
    ?.map((qrl) => {
      const symbol = qrl.$refSymbol$ || qrl.$symbol$;
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
  snapshotResult: SnapshotResult | null,
  opts: RenderToStringOptions,
  resolvedManifest: ResolvedManifest | undefined
): string[] {
  const prefetchStrategy = opts.prefetchStrategy;
  if (prefetchStrategy === null) {
    return [];
  }
  if (!resolvedManifest?.manifest.bundleGraph) {
    return getBundles(snapshotResult);
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
  for (const qrl of (snapshotResult?.qrls || []) as QRLInternal[]) {
    const symbol = getSymbolHash(qrl.$refSymbol$ || qrl.$symbol$);
    if (symbol && symbol.length >= 10) {
      symbols.add(symbol);
    }
  }
  return [...symbols];
}

export const expandBundles = (names: string[], resolvedManifest?: ResolvedManifest) => {
  if (!resolvedManifest?.manifest.bundleGraph) {
    return [...new Set(names)];
  }

  resetQueue();

  let probability = 0.99;
  // we assume that after 15 symbols, we're beyond the first screenful of content
  // the preloader will load the rest
  for (const name of names.slice(0, 15)) {
    preload(name, probability);
    // later symbols have less probability
    probability *= 0.85;
  }

  return getQueue().filter(
    (name) =>
      name !== resolvedManifest?.manifest.preloader && name !== resolvedManifest?.manifest.core
  );
};
