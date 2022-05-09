import { parseQRL } from '../core/import/qrl';
import { getValidManifest } from '../optimizer/src/manifest';
import type {
  PrefetchImplementation,
  PrefetchResource,
  QwikDocument,
  QwikManifest,
  RenderToStringOptions,
} from './types';
import { getBuildBase } from './utils';

export function getPrefetchResources(
  doc: QwikDocument,
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
        return getEventDocumentPrefetch(doc, manifest, buildBase);
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

function getEventDocumentPrefetch(doc: Document, manifest: QwikManifest, buildBase: string) {
  const eventQrls = new Set<string>();

  const findQwikEvent = (elm: HTMLElement) => {
    // on:click="q-e6e5d1dd.js#s_lJegR2RiUlU[0]"
    if (elm && elm.nodeType === 1) {
      const attrs = elm.attributes;
      if (attrs) {
        const attrLen = attrs.length;
        for (let i = 0; i < attrLen; i++) {
          const nodeName = attrs[i].nodeName;
          if (nodeName && nodeName.startsWith('on:')) {
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

      const childNodes = elm.childNodes;
      if (childNodes) {
        const childNodesLen = childNodes.length;
        for (let i = 0; i < childNodesLen; i++) {
          findQwikEvent(childNodes[i] as any);
        }
      }
    }
  };
  findQwikEvent(doc.body);

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

    prefetchResources.push({
      url,
      imports: [],
    });

    const bundle = manifest.bundles[fileName];
    if (bundle && bundle.imports) {
      for (const importedFilename of bundle.imports) {
        addBundle(manifest, urls, prefetchResources, buildBase, importedFilename);
      }
    }
  }
}

export function applyPrefetchImplementation(
  doc: QwikDocument,
  opts: RenderToStringOptions,
  prefetchResources: PrefetchResource[]
) {
  const prefetchStrategy = opts.prefetchStrategy;
  if (prefetchStrategy !== null) {
    const prefetchImpl = prefetchStrategy?.implementation || 'link-prefetch';
    if (
      prefetchImpl === 'link-prefetch' ||
      prefetchImpl === 'link-preload' ||
      prefetchImpl === 'link-modulepreload'
    ) {
      link(doc, prefetchResources, prefetchImpl);
    } else if (prefetchImpl === 'qrl-import') {
      qrlImport(doc, prefetchResources);
    } else if (prefetchImpl === 'worker-fetch') {
      workerFetch(doc, prefetchResources);
    }
  }
}

function link(
  doc: QwikDocument,
  prefetchResources: PrefetchResource[],
  prefetchImpl: PrefetchImplementation
) {
  for (const prefetchResource of prefetchResources) {
    const linkElm = doc.createElement('link');
    linkElm.setAttribute('href', prefetchResource.url);

    if (prefetchImpl === 'link-modulepreload') {
      linkElm.setAttribute('rel', 'modulepreload');
    } else if (prefetchImpl === 'link-preload') {
      linkElm.setAttribute('rel', 'preload');
      linkElm.setAttribute('as', 'script');
    } else {
      linkElm.setAttribute('rel', 'prefetch');
      linkElm.setAttribute('as', 'script');
    }

    doc.body.appendChild(linkElm);

    link(doc, prefetchResource.imports, prefetchImpl);
  }
}

function qrlImport(doc: QwikDocument, prefetchResources: PrefetchResource[]) {
  const script = doc.createElement('script');
  script.setAttribute('type', 'qwik/prefetch');
  script.innerHTML = JSON.stringify(prefetchResources);
  doc.body.appendChild(script);
}

function workerFetch(doc: QwikDocument, prefetchResources: PrefetchResource[]) {
  const fetch = `Promise.all(e.data.map(u=>fetch(u))).finally(()=>{setTimeout(postMessage({}),999)})`;

  const workerBody = `onmessage=(e)=>{${fetch}}`;

  const blob = `new Blob(['${workerBody}'],{type:"text/javascript"})`;

  const url = `URL.createObjectURL(${blob})`;

  let s = `const w=new Worker(${url});`;
  s += `w.postMessage(${JSON.stringify(
    prefetchResources.map((p) => p.url)
  )}.map(u=>new URL(u,origin)+''));`;
  s += `w.onmessage=()=>{w.terminate();document.getElementById('qwik-worker-fetch').remove()}`;

  const script = doc.createElement('script');
  script.setAttribute('type', 'module');
  script.setAttribute('id', 'qwik-worker-fetch');
  script.innerHTML = s;
  doc.body.appendChild(script);
}
