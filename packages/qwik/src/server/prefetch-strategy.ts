import { getBuildBase } from './utils';
import { getValidManifest } from '../optimizer/src/manifest';
import type {
  PrefetchResource,
  QwikManifest,
  RenderToStringOptions,
  SnapshotResult,
} from './types';
import { isQrl } from '../core/import/qrl-class';
import type { SymbolMapper } from '../optimizer/src/types';

export function getPrefetchResources(
  snapshotResult: SnapshotResult | null,
  opts: RenderToStringOptions,
  mapper: SymbolMapper | undefined
): PrefetchResource[] {
  const manifest = getValidManifest(opts.manifest);
  if (manifest && mapper) {
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
        return getAutoPrefetch(snapshotResult, manifest, mapper, buildBase);
      }

      if (typeof prefetchStrategy.symbolsToPrefetch === 'function') {
        // call user option symbolsToPrefetch()
        try {
          return prefetchStrategy.symbolsToPrefetch({ manifest });
        } catch (e) {
          console.error('getPrefetchUrls, symbolsToPrefetch()', e);
        }
      }
    }
  }

  // no urls to prefetch
  return [];
}

function getAutoPrefetch(
  snapshotResult: SnapshotResult | null,
  manifest: QwikManifest,
  mapper: SymbolMapper,
  buildBase: string
) {
  const prefetchResources: PrefetchResource[] = [];
  const listeners = snapshotResult?.listeners;
  const stateObjs = snapshotResult?.objs;
  const urls = new Set<string>();

  if (Array.isArray(listeners)) {
    // manifest already prioritized the symbols at build time
    for (const prioritizedSymbolName in mapper) {
      const hasSymbol = listeners.some((l) => {
        return l.qrl.getHash() === prioritizedSymbolName;
      });

      if (hasSymbol) {
        addBundle(manifest, urls, prefetchResources, buildBase, mapper[prioritizedSymbolName][1]);
      }
    }
  }

  if (Array.isArray(stateObjs)) {
    for (const obj of stateObjs) {
      if (isQrl(obj)) {
        const qrlSymbolName = obj.getHash();
        const resolvedSymbol = mapper[qrlSymbolName];
        if (resolvedSymbol) {
          addBundle(manifest, urls, prefetchResources, buildBase, resolvedSymbol[0]);
        }
      }
    }
  }

  return prefetchResources;
}

function addBundle(
  manifest: QwikManifest,
  urls: Set<string>,
  prefetchResources: PrefetchResource[],
  buildBase: string,
  bundleFileName: string
) {
  const url = buildBase + bundleFileName;

  if (!urls.has(url)) {
    urls.add(url);

    const bundle = manifest.bundles[bundleFileName];
    if (bundle) {
      const prefetchResource: PrefetchResource = {
        url,
        imports: [],
      };
      prefetchResources.push(prefetchResource);

      if (Array.isArray(bundle.imports)) {
        for (const importedFilename of bundle.imports) {
          addBundle(manifest, urls, prefetchResource.imports, buildBase, importedFilename);
        }
      }
    }
  }
}
