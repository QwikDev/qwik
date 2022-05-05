import { createPath } from '../core/util/path';
import { getValidManifest } from '../optimizer/src/manifest';
import type {
  PrefetchStrategyImplementation,
  QwikDocument,
  QwikManifest,
  RenderToStringOptions,
} from './types';
import { getBuildBase } from './utils';

export function getPrefetchUrls(doc: QwikDocument, opts: RenderToStringOptions): string[] {
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
        return [];
      }

      if (prefetchStrategy.symbolsToPrefetch === 'all-document') {
        // get all QRLs used in this document
        return [];
      }

      if (prefetchStrategy.symbolsToPrefetch === 'all') {
        // get all QRLs used in this app
        return getAllPrefetchUrls(manifest, buildBase);
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

function getAllPrefetchUrls(manifest: QwikManifest, buildBase: string) {
  const urls: string[] = [];

  // manifest already prioritized the symbols at build time
  for (const symbolName in manifest.mapping) {
    addBundle(manifest, urls, manifest.mapping[symbolName]);
  }

  return urls.map((url) => buildBase + url);
}

function addBundle(manifest: QwikManifest, urls: string[], url: string) {
  if (!urls.includes(url)) {
    urls.push(url);

    const bundle = manifest.bundles[url];
    if (bundle && bundle.imports) {
      for (const bundleUrl of bundle.imports) {
        addBundle(manifest, urls, bundleUrl);
      }
    }
  }
}

export function applyPrefetchImplementation(
  doc: QwikDocument,
  opts: RenderToStringOptions,
  prefetchUrls: string[]
) {
  const prefetchStrategy = opts.prefetchStrategy;
  if (prefetchStrategy !== null) {
    const prefetchImpl = prefetchStrategy?.implementation || 'link-prefetch';
    if (
      prefetchImpl === 'link-prefetch' ||
      prefetchImpl === 'link-preload' ||
      prefetchImpl === 'link-modulepreload'
    ) {
      link(doc, prefetchUrls, prefetchImpl);
    } else if (prefetchImpl === 'qrl-import') {
      qrlImport(doc, prefetchUrls);
    } else if (prefetchImpl === 'worker-fetch') {
      workerFetch(doc, prefetchUrls);
    }
  }
}

function link(
  doc: QwikDocument,
  prefetchUrls: string[],
  prefetchImpl: PrefetchStrategyImplementation
) {
  for (const prefetchUrl of prefetchUrls) {
    const link = doc.createElement('link');
    link.setAttribute('href', prefetchUrl);

    if (prefetchImpl === 'link-modulepreload') {
      link.setAttribute('rel', 'modulepreload');
    } else if (prefetchImpl === 'link-preload') {
      link.setAttribute('rel', 'preload');
      link.setAttribute('as', 'script');
    } else {
      link.setAttribute('rel', 'prefetch');
      link.setAttribute('as', 'script');
    }

    doc.body.appendChild(link);
  }
}

function qrlImport(doc: QwikDocument, urls: string[]) {
  const script = doc.createElement('script');
  script.setAttribute('type', 'qwik/prefetch');
  script.innerHTML = JSON.stringify(urls);
  doc.body.appendChild(script);
}

function workerFetch(doc: QwikDocument, urls: string[]) {
  const fetch = `Promise.all(e.data.map(u=>fetch(u))).finally(()=>{setTimeout(postMessage({}),999)})`;

  const workerBody = `onmessage=(e)=>{${fetch}}`;

  const blob = `new Blob(['${workerBody}'],{type:"text/javascript"})`;

  const url = `URL.createObjectURL(${blob})`;

  let s = `const w=new Worker(${url});`;
  s += `w.postMessage(${JSON.stringify(urls)}.map(u=>new URL(u,origin)+''));`;
  s += `w.onmessage=()=>{w.terminate();document.getElementById('qwik-worker-fetch').remove()}`;

  const script = doc.createElement('script');
  script.setAttribute('type', 'module');
  script.setAttribute('id', 'qwik-worker-fetch');
  script.innerHTML = s;
  doc.body.appendChild(script);
}

/**
 * Returns a list of imports for a JavaScript file.
 * @param file contents of JS file
 * @internal
 */
export function getImportsFromSource(file: string): string[] {
  const imports: string[] = [];
  const regex = /[import|from]\s+(['"`])(\..*)\1/g;
  let match = regex.exec(file);
  while (match != null) {
    imports.push(match[2]);
    match = regex.exec(file);
  }
  return imports;
}

/**
 * Returns a set of imports for a given source file.
 *
 * The function recursively visits the dependencies and returns a fully populated graph.
 *
 * This does not take dynamic imports into the account and so it produces an incomplete list.
 *
 * @param filePath - File path to read
 * @param readFileFn - a function used to retrieve the contents of a file at a given `filePath`
 * @alpha
 */
export async function getImports(
  filePath: string,
  readFileFn: (path: string) => Promise<string>
): Promise<string[]> {
  const imports: string[] = [];
  const path = createPath();
  await Promise.all(
    getImportsFromSource(await readFileFn(filePath)).map(async (fileImport) => {
      let resolvedFile = path.join(filePath, '..', fileImport);
      if (!resolvedFile.startsWith('.')) {
        resolvedFile = './' + resolvedFile;
      }
      imports.push(resolvedFile, ...(await getImports(resolvedFile, readFileFn)));
    })
  );
  return imports;
}
