import { directFetch, enqueueFileAndDependencies, parseBaseFilename } from './direct-fetch';
import type { SWState } from './state';

/**
 * Initialize the service worker with a bundle graph.
 *
 * The bundle graph ensures that waterfalls always have cache hits. If a parent bundle is needed the
 * bundle graph can answer which other bundles will be needed due to import statements.
 */
export type SWMsgBundleGraph = [
  /// Message type.
  'graph',
  /// Base URL for the bundles
  string,
  ...SWGraph,
];

/**
 * Initialize the service worker with a bundle graph from a URL.
 *
 * See `SWMsgBundleGraph` for more details.
 */
export type SWMsgBundleGraphUrl = [
  /// Message type.
  'graph-url',
  /// Base URL for the bundles
  string,
  /// relative URL to the bundle graph.
  string,
];

/**
 * Container bundle graph.
 *
 * - A string is a name of the bundle.
 * - Any number which follow the string point to dependant bundles which need to be also downloaded.
 */
export type SWGraph = Array<string | number>;

export type SWMsgPrefetch = [
  /// Message type.
  'prefetch',
  /// Base URL for the bundles
  string,
  /// List of bundles to prefetch.
  ...Array<string>,
];

export type SWMsgPrefetchAll = [
  /// Message type.
  'prefetch-all',
  /// Base URL for the bundles
  string,
];

export type SWMsgLinkPrefetch = [
  /// Message type.
  'link-prefetch',
  /// Base URL for the bundles
  string,
  /// Route path that the link points to
  string,
];

export type SWMessages =
  | SWMsgBundleGraph
  | SWMsgBundleGraphUrl
  | SWMsgPrefetch
  | SWMsgPrefetchAll
  | SWMsgLinkPrefetch;

export const log = (...args: any[]) => {
  // eslint-disable-next-line no-console
  console.log('⚙️ Prefetch SW:', ...args);
};

export const processMessage = async (state: SWState, msg: SWMessages) => {
  const type = msg[0];
  const base = msg[1];
  state.$log$('received message:', type, base, msg.slice(2));

  if (type === 'graph') {
    const graph = msg.slice(2);
    const doCleanup = true;
    await processBundleGraph(state, base, graph, doCleanup);
  } else if (type === 'graph-url') {
    const graphPath = msg[2];
    await processBundleGraphUrl(state, base, graphPath);
  } else if (type === 'prefetch') {
    const bundles = msg.slice(2);
    await processPrefetch(state, base, bundles);
  } else if (type === 'prefetch-all') {
    await processPrefetchAll(state, base);
  } else if (type === 'link-prefetch') {
    const route = msg[2];
    await processLinkPrefetch(state, base, route);
  } else if (type === 'ping') {
    log('ping');
  } else if (type === 'verbose') {
    (state.$log$ = log)('mode: verbose');
  } else {
    console.error('UNKNOWN MESSAGE:', msg);
  }
};

async function processBundleGraph(
  swState: SWState,
  base: string,
  graph: SWGraph,
  cleanup: boolean
) {
  const existingBaseIndex = swState.$bases$.findIndex((b) => b.$path$ === base);
  if (existingBaseIndex !== -1) {
    swState.$bases$.splice(existingBaseIndex, 1);
  }
  swState.$log$('adding base:', base);
  swState.$bases$.push({
    $path$: base,
    $graph$: graph,
    $processed$: undefined,
  });
  if (cleanup) {
    const bundles = new Set<string>(graph.filter((item) => typeof item === 'string') as string[]);
    const cache = await swState.$getCache$();
    if (cache) {
      for (const request of await cache.keys()) {
        const [cacheBase, filename] = parseBaseFilename(new URL(request.url));
        const promises: Promise<boolean>[] = [];
        if (cacheBase === base && !bundles.has(filename)) {
          swState.$log$('deleting', request.url);
          promises.push(cache.delete(request));
        }
        await Promise.all(promises);
      }
    }
  }
}

async function processBundleGraphUrl(swState: SWState, base: string, graphPath: string) {
  // Call `processBundleGraph` with an empty graph so that a cache location will be allocated.
  await processBundleGraph(swState, base, [], false);
  const response = (await directFetch(swState, new URL(base + graphPath, swState.$url$.origin)))!;
  if (response && response.status === 200) {
    const graph = (await response.json()) as SWGraph;
    graph.push(graphPath);
    await processBundleGraph(swState, base, graph, true);
  }
}

function processPrefetch(swState: SWState, basePath: string, bundles: string[]) {
  let base = swState.$bases$.find((base) => base.$graph$.includes(bundles[0].replace('./', '')));
  if (!base) {
    base = swState.$bases$.find((base) => basePath === base.$path$);
  }
  if (!base) {
    console.error(`Base path not found: ${basePath}, ignoring prefetch.`);
  } else {
    enqueueFileAndDependencies(swState, base, bundles, 0);
  }
}

function processPrefetchAll(swState: SWState, basePath: string) {
  const base = swState.$bases$.find((base) => basePath === base.$path$);
  if (!base) {
    console.error(`Base path not found: ${basePath}, ignoring prefetch.`);
  } else {
    processPrefetch(
      swState,
      basePath,
      base.$graph$.filter((item) => typeof item === 'string') as string[]
    );
  }
}

function processLinkPrefetch(swState: SWState, basePath: string, routePath: string) {
  const base = swState.$bases$.find((base) => basePath === base.$path$);
  if (!base) {
    console.error(
      `Base path not found: ${basePath}, ignoring link prefetch for route: ${routePath}`
    );
    return;
  }

  // Find bundles for this route from the bundle graph
  const ROUTES_SEPARATOR = -2;
  const graph = base.$graph$;
  const routeSeparatorIndex = graph.indexOf(ROUTES_SEPARATOR);

  if (routeSeparatorIndex === -1) {
    console.error(`No routes found in bundle graph for base: ${basePath}`);
    return;
  }

  // Remove trailing slash for lookup since routes in the bundle graph don't have them
  const pathWithoutSlash = routePath.endsWith('/') ? routePath.slice(0, -1) : routePath;

  // Find the route in the graph
  const routeIndex = graph.indexOf(pathWithoutSlash, routeSeparatorIndex);
  if (routeIndex === -1) {
    // Try with trailing slash if not found without it
    const withSlash = pathWithoutSlash + '/';
    const altRouteIndex = graph.indexOf(withSlash, routeSeparatorIndex);
    if (altRouteIndex === -1) {
      console.error(`Route ${routePath} not found in bundle graph`);
      return;
    }
  }

  // Collect all bundle indices after the route until the next route or end
  const bundleIndices: number[] = [];
  for (let i = routeIndex + 1; i < graph.length; i++) {
    const item = graph[i];
    // Stop when we hit the next route (string) or end
    if (typeof item === 'string') {
      break;
    }
    if (typeof item === 'number' && item >= 0) {
      bundleIndices.push(item);
    }
  }

  // Convert indices back to bundle names
  const routeBundles = bundleIndices.map((index) => graph[index] as string);

  // Use a very low priority for link prefetching since it's the most speculative
  const LINK_PREFETCH_PRIORITY = 0;
  swState.$log$('link prefetch for route:', routePath, 'bundles:', routeBundles);
  enqueueFileAndDependencies(swState, base, routeBundles, LINK_PREFETCH_PRIORITY);
}

export function drainMsgQueue(swState: SWState) {
  if (!swState.$msgQueuePromise$ && swState.$msgQueue$.length) {
    const top = swState.$msgQueue$.shift()!;
    swState.$msgQueuePromise$ = processMessage(swState, top).then(() => {
      swState.$msgQueuePromise$ = null;
      drainMsgQueue(swState);
    });
  }
}
