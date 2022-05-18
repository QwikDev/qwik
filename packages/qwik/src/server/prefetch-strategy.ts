import { getBuildBase } from './utils';
import { getValidManifest } from '../optimizer/src/manifest';
import type {
  PrefetchResource,
  QwikManifest,
  RenderToStringOptions,
  SnapshotResult,
} from './types';
import { isQrl } from '../core/import/qrl-class';

export function getPrefetchResources(
  snapshotResult: SnapshotResult | null,
  opts: RenderToStringOptions
): PrefetchResource[] {
  const manifest = getValidManifest(opts.manifest);
  if (manifest) {
    const prefetchStrategy = opts.prefetchStrategy;
    const buildBase = getBuildBase(opts);

    if (prefetchStrategy !== null) {
      // do nothing if opts.prefetchStrategy is explicitly set to null

      if (
        !prefetchStrategy ||
        !prefetchStrategy.symbolsToPrefetch ||
        prefetchStrategy.symbolsToPrefetch === 'events-document'
      ) {
        // DEFAULT 'events-document'
        // if prefetchStrategy is undefined
        // or prefetchStrategy.symbolsToPrefetch is undefined
        // get event QRLs used in this document
        return getEventDocumentPrefetch(snapshotResult, manifest, buildBase);
      }

      if (prefetchStrategy.symbolsToPrefetch === 'all') {
        // get all QRLs used in this app
        return getAllPrefetch(manifest, buildBase);
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

function getEventDocumentPrefetch(
  snapshotResult: SnapshotResult | null,
  manifest: QwikManifest,
  buildBase: string
) {
  const prefetchResources: PrefetchResource[] = [];
  const listeners = snapshotResult?.listeners;
  const stateObjs = snapshotResult?.objs;
  const urls = new Set<string>();

  if (Array.isArray(listeners)) {
    // manifest already prioritized the symbols at build time
    for (const prioritizedSymbolName in manifest.mapping) {
      const hasSymbol = listeners.some((l) => l.key === prioritizedSymbolName);
      if (hasSymbol) {
        addBundle(
          manifest,
          urls,
          prefetchResources,
          buildBase,
          manifest.mapping[prioritizedSymbolName]
        );
      }
    }
  }

  if (Array.isArray(stateObjs)) {
    for (const obj of stateObjs) {
      if (isQrl(obj)) {
        addBundle(manifest, urls, prefetchResources, buildBase, manifest.mapping[obj.symbol]);
      }
    }
  }

  return prefetchResources;
}

function getAllPrefetch(manifest: QwikManifest, buildBase: string) {
  const prefetchResources: PrefetchResource[] = [];
  const urls = new Set<string>();

  // manifest already prioritized the symbols at build time
  for (const prioritizedSymbolName in manifest.mapping) {
    addBundle(
      manifest,
      urls,
      prefetchResources,
      buildBase,
      manifest.mapping[prioritizedSymbolName]
    );
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

      if (Array.isArray(bundle.dynamicImports)) {
        for (const importedFilename of bundle.dynamicImports) {
          addBundle(manifest, urls, prefetchResource.imports, buildBase, importedFilename);
        }
      }
    }
  }
}
