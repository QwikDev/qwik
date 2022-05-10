import { parseQRL } from '../core/import/qrl';
import { QRL_PREFIX, SnapshotState } from '../core/object/store';
import { getValidManifest } from '../optimizer/src/manifest';
import type { PrefetchResource, QwikDocument, QwikManifest, RenderToStringOptions } from './types';
import { getBuildBase } from './utils';

export function getPrefetchResources(
  doc: QwikDocument,
  snapshotState: SnapshotState | null,
  opts: RenderToStringOptions
): PrefetchResource[] {
  const manifest = getValidManifest(opts.manifest);
  if (manifest) {
    const prefetchStrategy = opts.prefetchStrategy;
    const buildBase = getBuildBase(opts);

    if (prefetchStrategy !== null && buildBase != null) {
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
        return getEventDocumentPrefetch(doc, snapshotState, manifest, buildBase);
      }

      if (prefetchStrategy.symbolsToPrefetch === 'all') {
        // get all QRLs used in this app
        return getAllPrefetch(manifest, buildBase);
      }

      if (typeof prefetchStrategy.symbolsToPrefetch === 'function') {
        // call user option symbolsToPrefetch()
        try {
          return prefetchStrategy.symbolsToPrefetch({ document: doc, manifest });
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
  doc: Document,
  snapshotState: SnapshotState | null,
  manifest: QwikManifest,
  buildBase: string
) {
  const eventQrls = new Set<string>();

  const findQrls = (elm: HTMLElement) => {
    // on:click="q-e6e5d1dd.js#s_lJegR2RiUlU[0]"
    if (elm && elm.nodeType === 1) {
      const attrs = elm.attributes;
      if (attrs) {
        const attrLen = attrs.length;
        for (let i = 0; i < attrLen; i++) {
          const attrName = attrs[i].nodeName;
          if (attrName) {
            if (attrName.startsWith('on:')) {
              const qrlValue = attrs[i].nodeValue;
              if (qrlValue) {
                const qrls = qrlValue.split(' ');
                for (const qrl of qrls) {
                  const q = parseQRL(qrl);
                  if (q && q.symbol) {
                    eventQrls.add(q.symbol);
                  }
                }
              }
            }
          }
        }
      }

      const childNodes = elm.childNodes;
      if (childNodes) {
        const childNodesLen = childNodes.length;
        for (let i = 0; i < childNodesLen; i++) {
          findQrls(childNodes[i] as any);
        }
      }
    }
  };
  findQrls(doc.body);

  const prefetchResources: PrefetchResource[] = [];
  const urls = new Set<string>();

  eventQrls.forEach((eventSymbolName) => {
    // manifest already prioritized the symbols at build time
    for (const prioritizedSymbolName in manifest.mapping) {
      if (eventSymbolName === prioritizedSymbolName) {
        addBundle(
          manifest,
          urls,
          prefetchResources,
          buildBase,
          manifest.mapping[prioritizedSymbolName]
        );
        break;
      }
    }
  });

  if (snapshotState && Array.isArray(snapshotState.objs)) {
    for (const obj of snapshotState.objs) {
      if (typeof obj === 'string' && obj.startsWith(QRL_PREFIX)) {
        const q = parseQRL(obj);
        if (q && q.symbol) {
          addBundle(manifest, urls, prefetchResources, buildBase, manifest.mapping[q.symbol]);
        }
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
  fileName: string
) {
  const url = buildBase + fileName;

  if (!urls.has(url)) {
    urls.add(url);

    const prefetchResource: PrefetchResource = {
      url,
      imports: [],
    };
    prefetchResources.push(prefetchResource);

    const bundle = manifest.bundles[fileName];
    if (bundle) {
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
