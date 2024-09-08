import type { SWGraph, SWMessages } from './process-message';

/** Internal state of the Service Worker. */
export interface SWState {
  /** SW fetch for requesting bundles. */
  $fetch$: ServiceWorkerGlobalScope['fetch'];
  /** SW base service worker URL, against which all bundles are resolved. */
  $url$: URL;
  /** Download queue. */
  $queue$: Array<SWTask>;
  /** List of messages to process. */
  $msgQueue$: Array<SWMessages>;
  $msgQueuePromise$: Promise<void> | null;
  /** List of Base paths */
  $bases$: SWStateBase[];
  $getCache$: () => Promise<Cache> | Cache | null;
  /** Browser Cache */
  $cache$: Cache | null;
  $put$: Cache['put'];
  $match$: Cache['match'];
  /** Maximum number of prefetch requests. (Direct requests are not limited.) */
  $maxPrefetchRequests$: number;
  /** Log function */
  $log$: (...msg: any[]) => void;
}

/**
 * One SW can handle many containers. Each container has its own base path from which bundles are
 * loaded.
 */
export interface SWStateBase {
  /// Base path for the container.
  $path$: string;
  $graph$: SWGraph;
  $processed$: Map<string, { $direct$: string[]; $indirect$: string[] }> | undefined;
}

/** Task to download a bundle. */
export interface SWTask {
  /// Priority of the download.
  $priority$: number;
  /// URL of the bundle to download.
  $url$: URL;
  /// Response of the bundle.
  $response$: Promise<Response>;
  /// Resolve function for the response.
  $resolveResponse$: (response: Response) => void;
  /// Is the task currently being fetched (or is it waiting its turn)
  $isFetching$: boolean;
}

class SWStateImpl implements SWState {
  constructor(
    readonly $fetch$: ServiceWorkerGlobalScope['fetch'],
    readonly $url$: URL,
    // We initialize here so the minifier works correctly
    public $maxPrefetchRequests$ = 4,
    public $cache$: SWState['$cache$'] = null,
    public $msgQueuePromise$ = null,
    readonly $queue$ = [],
    readonly $bases$ = [],
    readonly $msgQueue$ = []
  ) {}

  $getCache$() {
    return this.$cache$;
  }
  async $put$(request: URL | RequestInfo, response: Response) {
    const cache = await this.$getCache$();
    return cache?.put(request, response);
  }
  async $match$(request: URL | RequestInfo) {
    const cache = await this.$getCache$();
    return cache?.match(request);
  }

  $log$() {}
}

export const createState = (fetch: ServiceWorkerGlobalScope['fetch'], url: URL): SWState => {
  return new SWStateImpl(fetch, url);
};
