import type {
  PrefetchResource,
  QwikManifest,
  RenderToStringOptions,
  SnapshotResult,
} from './types';
import { getBuildBase } from './utils';

import type { ResolvedManifest } from '@builder.io/qwik/optimizer';
import type { QRLInternal } from '../core/qrl/qrl-class';

export function getPrefetchResources(
  snapshotResult: SnapshotResult | null,
  opts: RenderToStringOptions,
  resolvedManifest: ResolvedManifest | undefined
): PrefetchResource[] {
  if (!resolvedManifest) {
    return [];
  }
  const prefetchStrategy = opts.prefetchStrategy;
  const buildBase = getBuildBase(opts);

  if (prefetchStrategy !== null) {
    // do nothing if opts.prefetchStrategy is explicitly set to null

    if (
      !prefetchStrategy ||
      !prefetchStrategy.symbolsToPrefetch ||
      prefetchStrategy.symbolsToPrefetch === 'auto'
    ) {
      // DEFAULT 'events-document'
      // if prefetchStrategy is undefined
      // or prefetchStrategy.symbolsToPrefetch is undefined
      // get event QRLs used in this document
      return getAutoPrefetch(snapshotResult, resolvedManifest, buildBase);
    }

    if (typeof prefetchStrategy.symbolsToPrefetch === 'function') {
      // call user option symbolsToPrefetch()
      try {
        return prefetchStrategy.symbolsToPrefetch({ manifest: resolvedManifest.manifest });
      } catch (e) {
        console.error('getPrefetchUrls, symbolsToPrefetch()', e);
      }
    }
  }
  // no urls to prefetch
  return [];
}

function getAutoPrefetch(
  snapshotResult: SnapshotResult | null,
  resolvedManifest: ResolvedManifest,
  buildBase: string
) {
  const prefetchResources: PrefetchResource[] = [];
  const qrls = snapshotResult?.qrls;
  const { mapper, manifest } = resolvedManifest;
  const urls = new Map<string, PrefetchResource>();

  if (Array.isArray(qrls)) {
    for (const obj of qrls) {
      const qrlSymbolName = obj.getHash();
      const resolvedSymbol = mapper[qrlSymbolName];
      if (resolvedSymbol) {
        addBundle(manifest, urls, prefetchResources, buildBase, resolvedSymbol[1]);
      }
    }
  }
  return prefetchResources;
}

function addBundle(
  manifest: QwikManifest,
  urls: Map<string, PrefetchResource>,
  prefetchResources: PrefetchResource[],
  buildBase: string,
  bundleFileName: string
) {
  const url = buildBase + bundleFileName;
  let prefetchResource = urls.get(url);
  if (!prefetchResource) {
    prefetchResource = {
      url,
      imports: [],
    };
    urls.set(url, prefetchResource);

    const bundle = manifest.bundles[bundleFileName];
    if (bundle) {
      if (Array.isArray(bundle.imports)) {
        for (const importedFilename of bundle.imports) {
          addBundle(manifest, urls, prefetchResource.imports, buildBase, importedFilename);
        }
      }
    }
  }
  prefetchResources.push(prefetchResource);
}

export const isQrl = (value: any): value is QRLInternal => {
  return typeof value === 'function' && typeof value.getSymbol === 'function';
};
