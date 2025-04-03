/* eslint-disable no-console */
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

const DEBUG = true;

const enum BundleImportState {
  None,
  QueuedLow,
  QueuedHigh,
  /** Preload link was made */
  Loading,
  LoadingHigh,
  /** All imports are >=Loading */
  Loaded,
}
type BundleImport = {
  $name$: string;
  $url$: string | null;
  $state$: BundleImportState;
  $imports$: string[];
  $dynamicImports$: string[];
  $priority$: boolean;
  $created$: number;
  $waited$: number;
  $loaded$: number;
  $didLoadHigh$: boolean;
};
const bundles = new Map<string, BundleImport>();
let gotBundleGraph = false;
const high: BundleImport[] = [];
const low: BundleImport[] = [];

let highCount = 0;
let lowCount = 0;
const loadStart = Date.now();

const log = (...args: any[]) => {
  console.log(
    `PL ${Date.now() - loadStart}> hi ${highCount}/${high.length} lo ${lowCount}/${low.length}`,
    ...args
  );
};
let base: string | undefined;

// minification helpers
const doc = isBrowser ? document : undefined!;
const modulePreloadStr = 'modulepreload';
const preloadStr = 'preload';

const checkLoaded = (bundle: BundleImport) => {
  if (bundle.$state$ === BundleImportState.Loaded) {
    return true;
  }
  if (
    bundle.$state$ === BundleImportState.Loading &&
    bundle.$imports$.every((dep) => bundles.get(dep)!.$state$ >= BundleImportState.Loading)
  ) {
    bundle.$state$ = BundleImportState.Loaded;
    return true;
  }
};

/**
 * This is called when a bundle is queued or finished loading.
 *
 * Because Chrome doesn't treat new modulepreloads as higher priority, we only make 5 links
 * available at a time, so that when a new high priority bundle comes in, it is soon preloaded.
 *
 * We make sure to first empty the high priority items, first-in-last-out.
 */
const trigger = () => {
  // high is confirmed needed so we go as wide as possible
  while (high.length) {
    const bundle = high.pop()!;
    preloadOne(bundle!, true);
  }
  /**
   * The low priority bundles are opportunistic, and we want to give the browser some breathing room
   * for other resources, so we cycle between 4 and 10 outstanding modulepreloads.
   */
  while (highCount + lowCount < 10 && low.length) {
    const bundle = low.pop()!;
    preloadOne(bundle!);
  }
  if (DEBUG && !high.length && !low.length) {
    const loaded = [...bundles.values()].filter((b) => b.$state$ >= BundleImportState.Loading);
    const waitTime = loaded.reduce((acc, b) => acc + b.$waited$, 0);
    const loadTime = loaded.reduce((acc, b) => acc + b.$loaded$, 0);
    log(`done ${loaded.length} total: ${waitTime}ms waited, ${loadTime}ms loaded`);
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
  if (checkLoaded(bundle)) {
    return;
  }
  if ((priority && !bundle.$didLoadHigh$) || bundle.$state$ < BundleImportState.Loading) {
    const start = Date.now();
    bundle.$waited$ = start - bundle.$created$;
    bundle.$state$ = priority ? BundleImportState.LoadingHigh : BundleImportState.Loading;
    bundle.$didLoadHigh$ = priority!;
    if (bundle.$url$) {
      DEBUG &&
        log(`load ${priority ? 'high' : 'low'} after ${`${bundle.$waited$}ms`}`, bundle.$name$);
      const link = doc.createElement('link');
      link.href = bundle.$url$!;
      link.rel = priority ? rel : 'preload';
      if (priority) {
        link.rel = rel;
        highCount++;
      } else {
        link.rel = 'preload';
        link.as = 'script';
        link.fetchPriority = 'low';
        lowCount++;
      }
      link.as = 'script';
      link.onload = link.onerror = () => {
        const end = Date.now();
        bundle.$loaded$ = end - start;
        DEBUG && log(`DONE ${bundle.$priority$ ? 'high' : 'low'} ${end - start}ms`, bundle.$name$);
        link.remove();
        if (priority) {
          highCount--;
        } else {
          lowCount--;
        }
        preload(bundle.$dynamicImports$);
        trigger();
      };

      doc.head.appendChild(link);
    }
  }

  // (re)queue dependencies
  preload(bundle.$imports$, priority);
  if (priority) {
    preload(bundle.$dynamicImports$);
  }
};

const makeBundle = (path: string, imports: string[], dynamicImports: string[]) => {
  const url = path.endsWith('.js') ? new URL(`${base}${path}`, doc.baseURI).toString() : null;
  return {
    $name$: path,
    $url$: url,
    $state$: BundleImportState.None,
    $imports$: imports,
    $dynamicImports$: dynamicImports,
    $priority$: false,
    $created$: Date.now(),
    $waited$: 0,
    $loaded$: 0,
    $didLoadHigh$: false,
  };
};

const parseBundleGraph = (text: string) => {
  DEBUG && log(`parseBundleGraph ${text.length >> 10}kB`);
  const graph = JSON.parse(text) as QwikBundleGraph;
  let i = 0;
  // All existing loading bundles need imports processed
  const toProcess = [...bundles.values()]
    .filter((bundle) => {
      return bundle.$state$ >= BundleImportState.Loading;
    })
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
      if (bundle.$state$ === BundleImportState.Loaded) {
        bundle.$state$ = BundleImportState.Loading;
      }
    } else {
      bundles.set(name, makeBundle(name, imports, dynamicImports));
    }
  }
  DEBUG &&
    log(`parseBundleGraph done ${bundles.size} bundles, will process ${toProcess.length} bundles`);
  gotBundleGraph = true;
  for (const bundle of toProcess) {
    preload(bundle.$imports$, true);
    preload(bundle.$dynamicImports$);
  }
};

const handleBundle = (name: string, collection: BundleImport[], priority: boolean) => {
  let bundle = bundles.get(name);
  if (!bundle) {
    if (gotBundleGraph) {
      return;
    }
    bundle = makeBundle(name, [], []);
    bundles.set(name, bundle);
  }
  if (checkLoaded(bundle)) {
    return;
  }
  if (bundle.$state$ < BundleImportState.QueuedHigh) {
    if (priority) {
      bundle.$priority$ = true;
      bundle.$state$ = BundleImportState.QueuedHigh;
      collection.push(bundle);
    } else {
      bundle.$state$ = BundleImportState.QueuedLow;
      collection.unshift(bundle);
    }
    return true;
  }
};

let allOk = true;
/**
 * Preload a bundle or bundles. Requires calling loadBundleGraph first.
 *
 * @internal
 */
const preload = (name: string | string[], priority?: boolean) => {
  if (!isBrowser || !base || !name.length) {
    return;
  }
  if (!allOk) {
    return;
  }
  const queue = priority ? high : low;
  let didQueue = false;
  if (Array.isArray(name)) {
    // We must process in reverse order to ensure first bundles are handled first
    for (let i = name.length - 1; i >= 0; i--) {
      didQueue = handleBundle(name[i], queue, priority!) || didQueue;
    }
  } else {
    didQueue = handleBundle(name, queue, priority!)!;
  }
  if (didQueue) {
    DEBUG && log(`queue ${priority ? 'high' : 'low'}`, name);
    trigger();
    if (low.length > 5000) {
      // just a precaution, should never happen
      allOk = false;
    }
  }
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
    .then((text) => parseBundleGraph(text))
    // We warn because it's not critical, and in the CI tests Windows serves up a HTML file instead the bundle graph sometimes, which breaks the tests that don't expect error logs
    .catch(console.warn);
};

// Short names for minification
export { loadBundleGraph as l, preload as p };
