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

export type SWMessages = SWMsgBundleGraph | SWMsgBundleGraphUrl | SWMsgPrefetch | SWMsgPrefetchAll;

export const log = (...args: any[]) => {
  // eslint-disable-next-line no-console
  console.log('⚙️ Prefetch SW:', ...args);
};

export const processMessage = async (state: SWState, msg: SWMessages) => {
  const type = msg[0];
  state.$log$('received message:', type, msg[1], msg.slice(2));
  if (type === 'graph') {
    await processBundleGraph(state, msg[1], msg.slice(2), true);
  } else if (type === 'graph-url') {
    await processBundleGraphUrl(state, msg[1], msg[2]);
  } else if (type === 'prefetch') {
    await processPrefetch(state, msg[1], msg.slice(2));
  } else if (type === 'prefetch-all') {
    await processPrefetchAll(state, msg[1]);
  } else if (type === 'ping') {
    // eslint-disable-next-line no-console
    log('ping');
  } else if (type === 'verbose') {
    // eslint-disable-next-line no-console
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

export function drainMsgQueue(swState: SWState) {
  if (!swState.$msgQueuePromise$ && swState.$msgQueue$.length) {
    const top = swState.$msgQueue$.shift()!;
    swState.$msgQueuePromise$ = processMessage(swState, top).then(() => {
      swState.$msgQueuePromise$ = null;
      drainMsgQueue(swState);
    });
  }
}
