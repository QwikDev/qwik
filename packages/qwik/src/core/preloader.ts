/**
 * Note: this file gets built separately from the rest of the core module, and is then kept separate
 * in the dist directory via manualChunks. This way it can run before the rest of the core module is
 * loaded, but core can still use it.
 *
 * Here we handle preloading of bundles.
 *
 * Given a symbol hash (in fact any string), we can find all the bundles that it depends on, via the
 * bundle graph. We then generate preload link tags for each of those bundles.
 *
 * There are several parts to this:
 *
 * - Load the bundle graph from the preload link tag that was injected during SSR
 * - Given a string, find all the bundles that it depends on
 * - Generate the preload link tags if needed
 *
 * In practice, we queue incoming requests and when we process
 */
/**
 * Todo
 *
 * - High and low priority sets
 * - Num preloads active at a time
 * - If no modulepreload support, do 1 fetch at a time
 */

import { isBrowser } from '@builder.io/qwik/build';
import type { QwikBundleGraph } from '../optimizer/src/types';

const enum BundleImportState {
  None,
  Low,
  Queued,
  Loading,
}
type BundleImport = {
  $url$: string | null;
  $state$: BundleImportState;
  $imports$: string[];
  $dynamicImports$: string[];
};
const bundles = new Map<string, BundleImport>();
const high: BundleImport[] = [];
const low: BundleImport[] = [];

let base: string | undefined;

// minification helpers
const doc = isBrowser ? document : undefined!;
const modulePreloadStr = 'modulepreload';
const preloadStr = 'preload';

let highCount = 0;
let lowCount = 0;
const max = 11;
/**
 * This is called when a bundle is queued or finished loading.
 *
 * Because Chrome doesn't treat new modulepreloads as higher priority, we only make 5 links
 * available at a time, so that when a new high priority bundle comes in, it is soon preloaded.
 *
 * We make sure to first empty the high priority items, first-in-last-out.
 */
const trigger = () => {
  while (highCount < max && high.length) {
    const bundle = high.pop()!;
    preloadOne(bundle!, true);
  }
  while (highCount + lowCount < max && low.length) {
    const bundle = low.pop()!;
    preloadOne(bundle!);
  }
};

const rel =
  isBrowser && doc.createElement('link').relList.supports(modulePreloadStr)
    ? modulePreloadStr
    : preloadStr;
/**
 * Note, we considered using `preload` for low priority bundles, but those don't get preparsed and
 * that slows down interaction
 */
const preloadOne = (bundle: BundleImport, priority?: boolean) => {
  if (bundle.$state$ === BundleImportState.Loading) {
    return;
  }
  if (bundle.$url$) {
    const link = doc.createElement('link');
    link.href = bundle.$url$!;
    link.rel = rel;
    if (priority) {
      highCount++;
    } else {
      lowCount++;
    }
    link.as = 'script';
    link.onload = link.onerror = () => {
      link.remove();
      if (priority) {
        highCount--;
      } else {
        lowCount--;
      }
      trigger();
    };

    doc.head.appendChild(link);
  }

  bundle.$state$ = BundleImportState.Loading;
  /** Now that we processed the bundle, its dependencies are needed ASAP */
  if (priority) {
    // make sure to queue the high priority imports first so they preloaded before the low priority ones
    preload(bundle.$imports$, priority);
    preload(bundle.$dynamicImports$);
  } else {
    preload([...bundle.$imports$, ...bundle.$dynamicImports$]);
  }
};

const makeBundle = (path: string, imports: string[], dynamicImports: string[]) => {
  const url = path.endsWith('.js') ? new URL(`${base}${path}`, doc.baseURI).toString() : null;
  return {
    $url$: url,
    $state$: BundleImportState.None,
    $imports$: imports,
    $dynamicImports$: dynamicImports,
  };
};
const ensureBundle = (name: string) => {
  let bundle = bundles.get(name);
  if (!bundle) {
    bundle = makeBundle(name, [], []);
    bundles.set(name, bundle);
  }
  if (bundle.$state$ === BundleImportState.Loading) {
    return;
  }
  return bundle;
};

const parseBundleGraph = (text: string, base: string) => {
  const graph = JSON.parse(text) as QwikBundleGraph;
  let i = 0;
  // All existing loading bundles need imports processed
  const toProcess = Object.keys(bundles)
    .filter((name) => bundles.get(name)!.$state$ === BundleImportState.Loading)
    .reverse();
  while (i < graph.length) {
    const name = graph[i++] as string;
    const imports: string[] = [];
    const dynamicImports: string[] = [];
    let idx: number | string;
    let collection = imports;
    while (((idx = graph[i]), typeof idx === 'number')) {
      if (idx === -1) {
        collection = dynamicImports;
      } else {
        collection.push(graph[idx] as string);
      }
      i++;
    }
    if (bundles.has(name)) {
      const bundle = bundles.get(name)!;
      bundle.$imports$ = imports;
      bundle.$dynamicImports$ = dynamicImports;
    } else {
      bundles.set(name, makeBundle(name, imports, dynamicImports));
    }
  }
  for (const name of toProcess) {
    const bundle = bundles.get(name)!;
    // we assume low priority
    preload([...bundle.$imports$, ...bundle.$dynamicImports$]);
  }
};

/**
 * Preload a bundle or bundles. Requires calling loadBundleGraph first.
 *
 * @internal
 */
const preload = (name: string | string[], priority?: boolean) => {
  if (!isBrowser || !base) {
    return;
  }
  const queue = priority ? high : low;
  if (Array.isArray(name)) {
    queue.push(...(name.map(ensureBundle).filter(Boolean) as BundleImport[]).reverse());
  } else {
    const bundle = ensureBundle(name);
    if (bundle) {
      queue.push(bundle);
    }
  }
  trigger();
};

/**
 * Lazily load the bundle graph and then import dependencies of bundles that were loaded already.
 *
 * @internal
 */
const loadBundleGraph = (basePath: string, manifestHash: string) => {
  if (!isBrowser || base) {
    return;
  }
  base = basePath;
  // TODO check TTI, maybe inject fetch link with timeout so we don't do the fetch directly
  fetch(`${basePath}q-bundle-graph-${manifestHash}.json`)
    .then((res) => res.text())
    .then((text) => parseBundleGraph(text, basePath))
    // We warn because it's not critical, and in the CI tests Windows serves up a HTML file instead the bundle graph sometimes, which breaks the tests that don't expect error logs
    .catch(console.warn);
};

// Short names for minification
export { loadBundleGraph as l, preload as p };
