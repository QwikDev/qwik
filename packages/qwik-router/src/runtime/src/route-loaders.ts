import * as qwikRouterConfig from '@qwik-router-config';
import { implicit$FirstArg, isDev, isServer, type NoSerialize, type QRL } from '@qwik.dev/core';
import {
  _deserialize,
  _getContextEvent,
  _getContextContainer,
  _injectAsyncSignalValue,
  _markSignalAsExternallyOwned,
  _resolveContextWithoutSequentialScope,
  _verifySerializable,
  _UNINITIALIZED,
  createAsync$,
  SerializerSymbol,
  type AsyncSignal,
  type SerializationStrategy,
} from '@qwik.dev/core/internal';
import type {
  RequestEvent as RequestEventBase,
  RequestEventLoader as ServerRequestEventLoader,
} from '@qwik.dev/router/middleware/request-handler';
// Import directly from leaf modules to avoid circular dependency:
// route-loaders.ts → middleware barrel → runtime/src/ (same module group)
import { _asyncRequestStore } from '../../middleware/request-handler/async-request-store';
import { getLoaderName } from '../../middleware/request-handler/request-path';
import { RedirectMessage } from '../../middleware/request-handler/redirect-handler';
import { ServerError } from '../../middleware/request-handler/server-error';
import { ensureSlash } from '../../utils/pathname';
import { DEFAULT_LOADERS_SERIALIZATION_STRATEGY } from './constants';
import { RouteLoaderCtxContext, RouteStateContext } from './contexts';
import type {
  DataValidator,
  LoaderConstructor,
  LoaderConstructorQRL,
  LoaderInternal,
  LoaderOptions,
  RequestEvent,
  RequestEventLoader,
  RouteNavigate,
  RouteModule,
  ValidatorReturn,
} from './types';

/**
 * Route loaders read data before the route rendering starts, based on the route being navigated to.
 * They automatically update when the route changes on the client, and can also be made to poll for
 * changes.
 *
 * They are represented by an AsyncSignal.
 */

const REQUEST_ROUTE_LOADER_STATE = '@routeLoaderState';
const REQUEST_LOADER_PATHS_STORE = '@loaderPathsStore';
const REQUEST_ROUTE_LOADERS = '@routeLoaders';
const REQUEST_ROUTE_LOADER_PROMISES = '@routeLoaderPromises';
const REQUEST_ROUTE_LOADER_EVENTS = '@routeLoaderEvents';
const REQUEST_ROUTE_LOADER_ROOT_EVENT = '@routeLoaderRootEvent';
const ROUTE_LOADER_VALUE_PREFIX = '__qwik_route_loader_value__';

/** Header name sent by client to tell the server the actual page URL for loader requests. */
export const FULLPATH_HEADER = 'X-Qwik-fullpath';

/**
 * Response envelope for loader.json requests. Exactly one of `d`, `r`, or `e` is set.
 *
 * - `d` — data: the loader's successful return value
 * - `r` — redirect: URL to navigate to (from `throw redirect()`)
 * - `e` — error: a ServerError (from `fail()` or `throw serverError()`)
 */
export type LoaderResponse = {
  d?: unknown;
  r?: string;
  e?: InstanceType<typeof ServerError>;
};

type LoaderFetchCacheEntry = {
  promise?: Promise<LoaderResponse | undefined>;
  value?: LoaderResponse;
  expires: number;
};

const LOADER_FETCH_CACHE_TTL = 5_000;
const LOADER_FETCH_CACHE_MAX = 128;
/** Preload fetch cache, prevents duplicate fetches */
const fetchCache = new Map<string, LoaderFetchCacheEntry>();

const perfNow = () => globalThis.performance?.now() ?? Date.now();

const isRedirectStatus = (status: number) => status >= 300 && status < 400;

const setCache = (key: string, entry: LoaderFetchCacheEntry) => {
  fetchCache.set(key, entry);
  if (fetchCache.size > LOADER_FETCH_CACHE_MAX) {
    const oldestKey = fetchCache.keys().next().value;
    if (oldestKey !== undefined) {
      fetchCache.delete(oldestKey);
    }
  }
};

/** We don't have aborts when preloading so we just pretend we do */
const wrapWithAbort = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.finally(() => signal.removeEventListener('abort', abort)).then(resolve, reject);
  });
};

/**
 * Reactive context for route loaders. On the server this is stored in sharedMap, on the client it's
 * a store that gets updated on navigation.
 *
 * - `loaderPaths`: loader ID → fetch path (the longest route path for that loader)
 * - `pagePathname` / `pageSearch`: client-only navigation state used for loader invalidation and
 *   q-loader fetches. They are intentionally omitted from SSR state and fall back to `location`
 *   until the first SPA navigation.
 */
export type RouteLoaderCtx = {
  loaderPaths: Record<string, string | undefined>;
  pagePathname?: string;
  pageSearch?: string;
  /** SPA navigation function. Client-only and intentionally omitted from SSR state. */
  goto?: NoSerialize<RouteNavigate>;
};

export type RouteLoaderState = Record<string, AsyncSignal<unknown>>;

const getRouteLoaderValueStateKey = (loaderId: string) => `${ROUTE_LOADER_VALUE_PREFIX}${loaderId}`;

class ServerRouteLoaderCapture {
  constructor(
    readonly hash: string,
    readonly qrl: QRL<(event: RequestEventLoader) => unknown>,
    readonly validators: DataValidator[] | undefined
  ) {}

  load() {
    const requestEv = getRequestEvent();
    // Use pre-computed value from loadersMiddleware if available,
    // to avoid re-running the loader after the response stream is open.
    const values = getRouteLoaderValues(requestEv);
    if (this.hash in values) {
      return values[this.hash];
    }
    return loadRouteLoaderByQrl(this.hash, this.qrl, this.validators, requestEv);
  }

  [SerializerSymbol]() {
    return this.hash;
  }
}

const isRequestEvent = (value: unknown): value is RequestEvent =>
  !!value &&
  typeof value === 'object' &&
  Object.prototype.hasOwnProperty.call(value, 'sharedMap') &&
  Object.prototype.hasOwnProperty.call(value, 'cookie');

const isLoaderInternal = (value: unknown): value is LoaderInternal =>
  typeof value === 'function' && (value as LoaderInternal).__brand === 'server_loader';

const getClientManifestHash = (ctx: unknown) => {
  // We cheat and grab the internal signal of the AsyncJob
  // Maybe we should expose .signal? Would be good for implementing channels
  const container = (ctx as { $signal$?: { $container$?: unknown } }).$signal$?.$container$;
  return (
    (container as { qManifestHash?: string } | undefined)?.qManifestHash ||
    (_getContextContainer() as { qManifestHash?: string } | undefined)?.qManifestHash ||
    'dev'
  );
};

/**
 * Fetch a single loader's data from the server.
 *
 * URL pattern: `{basePath}{routePath}/q-loader-{loaderId}.{manifestHash}.json`
 */
/** Fetch a loader's JSON response from the server. Returns the LoaderResponse envelope. */
export const fetchRouteLoaderData = async (
  loaderId: string,
  routePath: string | undefined,
  manifestHash: string,
  opts?: {
    pageUrl?: URL;
    basePath?: string;
    ignoreCache?: boolean;
    signal?: AbortSignal;
  }
): Promise<LoaderResponse | undefined> => {
  if (!routePath) {
    return undefined;
  }
  // Ensure the route path includes the base path (root trie loaders get '/' but
  // need the full base path for fetching)
  let resolvedPath = routePath;
  const basePath = opts?.basePath ?? '/';
  if (basePath !== '/' && !resolvedPath.startsWith(basePath)) {
    resolvedPath = basePath + resolvedPath.slice(1);
  }
  const pathBase = ensureSlash(resolvedPath);
  const pageUrl = opts?.pageUrl;
  const search = pageUrl?.search ?? '';
  // TODO allowList search params + compat flag that allows search params
  const url = `${pathBase}${getLoaderName(loaderId, manifestHash)}${search}`;

  const headers: Record<string, string> = {};
  if (pageUrl && pageUrl.pathname !== pathBase && !globalThis.__STRICT_LOADERS__) {
    headers[FULLPATH_HEADER] = pageUrl.pathname;
  }

  const cacheKey = `${url}\n${headers[FULLPATH_HEADER] ?? ''}`;
  if (!opts?.ignoreCache) {
    const entry = fetchCache.get(cacheKey);
    if (entry) {
      if (entry.promise) {
        return opts?.signal ? wrapWithAbort(entry.promise, opts.signal) : entry.promise;
      }
      if (entry.expires > perfNow()) {
        return entry.value;
      }
      fetchCache.delete(cacheKey);
    }
  }

  const request = async () => {
    const response = await fetch(url, {
      signal: opts?.signal,
      cache: opts?.ignoreCache ? 'reload' : 'default',
      headers,
    });
    // Middleware redirects produce HTTP 3xx — convert to LoaderResponse
    if (response.redirected) {
      return { r: response.url };
    }
    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('Location');
      if (location) {
        return { r: location };
      }
    }
    if (!response.ok) {
      return undefined;
    }
    const text = await response.text();
    return _deserialize<LoaderResponse>(text) ?? undefined;
  };

  if (opts?.ignoreCache || opts?.signal) {
    // Never cache these requests, since they're either one-off or have abort signals that can't be shared
    // The browser cache will still apply
    return request();
  }

  const promise = request().then(
    (value) => {
      if (value === undefined) {
        fetchCache.delete(cacheKey);
      } else {
        setCache(cacheKey, {
          value,
          expires: perfNow() + LOADER_FETCH_CACHE_TTL,
        });
      }
      return value;
    },
    (err) => {
      fetchCache.delete(cacheKey);
      throw err;
    }
  );
  setCache(cacheKey, {
    promise,
    expires: perfNow() + LOADER_FETCH_CACHE_TTL,
  });
  return promise;
};

const createRouteLoaderSignal = (
  loader: LoaderInternal,
  routeLoaderCtx: RouteLoaderCtx,
  state: RouteLoaderState
) => {
  const id = loader.__id;
  const stateValues = state as Record<string, unknown>;
  const resumeValueKey = getRouteLoaderValueStateKey(id);
  const capture = isServer
    ? new ServerRouteLoaderCapture(id, loader.__qrl, loader.__validators)
    : id;
  const searchFilter = loader.__search;
  const lastFetch: {
    filteredSearch?: string;
    routePath?: string;
  } = {};
  const signal = createAsync$(
    async (ctx) => {
      const { track, info, previous, abortSignal } = ctx;
      const hasInjectedValue = !!info && typeof info === 'object' && '__v' in (info as object);
      const trackedRoutePath = track(routeLoaderCtx.loaderPaths, id) as string | undefined;
      const trackedPagePathname = track(routeLoaderCtx, 'pagePathname') as string | undefined;
      const trackedPageSearch = track(routeLoaderCtx, 'pageSearch') as string | undefined;
      // Pre-loaded value injection (from middleware via setLoaderSignalValue, or from
      // an action response). Client-side route dependencies must already be tracked
      // here so a resumed loader can re-fetch on the first SPA navigation.
      if (hasInjectedValue) {
        const value = (info as { __v: unknown }).__v;
        if (!isServer && resumeValueKey in stateValues) {
          stateValues[resumeValueKey] = value;
        }
        return value;
      }
      if (isServer) {
        return (capture as ServerRouteLoaderCapture).load();
      }
      // Track reactive dependencies so the signal re-fetches when the route path changes
      const routePath = trackedRoutePath;
      // Track the client page path/search. These fields are only assigned on SPA navigation; before
      // that, `location` is the source of truth and avoids serializing a duplicate URL in SSR state.
      const pagePathname = trackedPagePathname || location.pathname;
      const pageSearch = trackedPageSearch || location.search;
      const pageUrl = new URL(pagePathname + pageSearch, location.href);
      const mHash = getClientManifestHash(ctx);
      const basePath = (qwikRouterConfig as any).basePathname ?? '/';
      const needsResumeFetch = stateValues[resumeValueKey] === _UNINITIALIZED;
      const fetchRoutePath = routePath || (needsResumeFetch ? pageUrl.pathname : undefined);
      // A loader that's never been on any route we've visited has no fetch path yet —
      // return whatever value it has (undefined on the very first run). In practice
      // this branch only fires on the initial client-side read for a loader that
      // wasn't prefilled by SSR; normal navs leave stale entries in loaderPaths so
      // this compute only runs when there's a fresh path to fetch against.
      if (!fetchRoutePath) {
        return previous;
      }

      // Filter search params: only include allowed params and skip fetch if unchanged
      let fetchUrl = pageUrl;
      if (searchFilter) {
        const filteredSearch = filterSearchParams(pageUrl.searchParams, searchFilter);
        if (
          previous !== undefined &&
          filteredSearch === lastFetch.filteredSearch &&
          fetchRoutePath === lastFetch.routePath
        ) {
          // Relevant search params didn't change and path didn't change — return previous value
          return previous;
        }
        lastFetch.filteredSearch = filteredSearch;
        lastFetch.routePath = fetchRoutePath;
        // Build a URL with only the allowed search params for the fetch
        fetchUrl = new URL(pageUrl.href);
        fetchUrl.search = filteredSearch;
      }

      // Fetch from server
      const response = await fetchRouteLoaderData(id, fetchRoutePath, mHash, {
        pageUrl: fetchUrl,
        basePath,
        ignoreCache: info === true,
        signal: abortSignal,
      });
      if (!response) {
        throw new Error(`Loader ${id} returned empty response`);
      }
      if (response.r) {
        // Redirect — fire SPA goto if available, else full page nav. We don't
        // await or coordinate with the current nav: the new nav starts while
        // this one finishes committing, producing a brief flash of stale data
        // before the new route's loaders resolve. That trade-off is intentional
        // — awaiting all loader promises just to catch redirects is too costly
        // for the common case.
        //
        const goto = routeLoaderCtx.goto;
        if (goto) {
          goto(response.r, { replaceState: true });
        } else {
          location.href = response.r;
        }
        // Return `previous` (stale data) rather than throwing: an AsyncSignal
        // in error state can drop Resource subscriptions, which would prevent
        // the redirect-target fetch from updating the UI once it arrives.
        return previous;
      }
      if (response.e) {
        // Error — throw so AsyncSignal enters error state
        throw response.e;
      }
      if (needsResumeFetch) {
        stateValues[resumeValueKey] = response.d;
      }
      return response.d;
    },

    {
      serializationStrategy: loader.__serializationStrategy,
      expires: loader.__expires,
      poll: loader.__poll,
      allowStale: loader.__allowStale,
    }
  );
  _markSignalAsExternallyOwned(signal);
  return signal;
};

/** Build a sorted, stable search string from only the allowed param names. */
export const filterSearchParams = (params: URLSearchParams, allowed: string[]): string => {
  const filtered = new URLSearchParams();
  for (let i = 0; i < allowed.length; i++) {
    const name = allowed[i];
    const values = params.getAll(name);
    for (let j = 0; j < values.length; j++) {
      filtered.append(name, values[j]);
    }
  }
  filtered.sort();
  return filtered.toString() ? `?${filtered.toString()}` : '';
};

const getLoaderOptions = (rest: (LoaderOptions | DataValidator)[]) => {
  let id: string | undefined;
  let serializationStrategy: SerializationStrategy = DEFAULT_LOADERS_SERIALIZATION_STRATEGY;
  let expires: number | undefined;
  let poll: boolean | undefined;
  let eTag: LoaderOptions['eTag'] | undefined;
  let cacheKey: LoaderOptions['cacheKey'] | undefined;
  let search: string[] | undefined;
  let allowStale = true;
  const validators: DataValidator[] = [];

  if (rest.length === 1) {
    const options = rest[0];
    if (options && typeof options === 'object') {
      if ('validate' in options) {
        validators.push(options);
      } else {
        if (options.id) {
          id = options.id;
        }
        if (options.serializationStrategy) {
          serializationStrategy = options.serializationStrategy;
        }
        if (options.validation) {
          validators.push(...options.validation);
        }
        if ('expires' in options) {
          expires = options.expires;
        }
        if ('poll' in options) {
          poll = options.poll;
        }
        if ('eTag' in options) {
          eTag = options.eTag;
        }
        if ('cacheKey' in options) {
          cacheKey = options.cacheKey;
        }
        if (options.search) {
          search = options.search;
        } else if (globalThis.__STRICT_LOADERS__) {
          search = [];
        }
        if (options.allowStale === false) {
          allowStale = false;
        }
      }
    }
  } else if (rest.length > 1) {
    validators.push(...(rest.filter(Boolean) as DataValidator[]));
  }

  return {
    id,
    validators: validators.reverse(),
    serializationStrategy,
    expires,
    poll,
    eTag,
    cacheKey,
    search,
    allowStale,
  };
};

export const getRequestEvent = (thisArg?: unknown): RequestEvent => {
  if (!isServer) {
    throw new Error('getRequestEvent() can only be used on the server.');
  }
  const requestEvent =
    _asyncRequestStore?.getStore() || [thisArg, _getContextEvent()].find(isRequestEvent);
  if (!requestEvent) {
    throw new Error('Unable to determine the current RequestEvent.');
  }
  return requestEvent;
};

const REQUEST_ROUTE_LOADER_VALUES = '@routeLoaderValues';

export function getRouteLoaderState(requestEv: RequestEventBase): RouteLoaderState {
  let state = requestEv.sharedMap.get(REQUEST_ROUTE_LOADER_STATE) as RouteLoaderState | undefined;
  if (!state) {
    state = {};
    requestEv.sharedMap.set(REQUEST_ROUTE_LOADER_STATE, state);
  }
  return state;
}

/** Get/create the record of pre-loaded loader values (used by middleware before component). */
export function getRouteLoaderValues(requestEv: RequestEventBase): Record<string, unknown> {
  let values = requestEv.sharedMap.get(REQUEST_ROUTE_LOADER_VALUES) as
    | Record<string, unknown>
    | undefined;
  if (!values) {
    values = {};
    requestEv.sharedMap.set(REQUEST_ROUTE_LOADER_VALUES, values);
  }
  return values;
}

function getRouteLoaderPromises(requestEv: RequestEventBase): Record<string, Promise<unknown>> {
  let promises = requestEv.sharedMap.get(REQUEST_ROUTE_LOADER_PROMISES) as
    | Record<string, Promise<unknown>>
    | undefined;
  if (!promises) {
    promises = {};
    requestEv.sharedMap.set(REQUEST_ROUTE_LOADER_PROMISES, promises);
  }
  return promises;
}

/** Store the route loader internals on the request for SSG to read. */
export function setRouteLoaders(requestEv: RequestEventBase, loaders: LoaderInternal[]) {
  requestEv.sharedMap.set(REQUEST_ROUTE_LOADERS, loaders);
}

/** Get the route loader internals stored on the request. */
export function getRouteLoaders(requestEv: RequestEventBase): LoaderInternal[] {
  return requestEv.sharedMap.get(REQUEST_ROUTE_LOADERS) ?? [];
}

export function getRouteLoaderCtx(requestEv: RequestEventBase): RouteLoaderCtx {
  let ctx = requestEv.sharedMap.get(REQUEST_LOADER_PATHS_STORE) as RouteLoaderCtx | undefined;
  if (!ctx) {
    ctx = {
      loaderPaths: {},
    };
    requestEv.sharedMap.set(REQUEST_LOADER_PATHS_STORE, ctx);
  }
  return ctx;
}

/**
 * Update the loader paths store on client-side navigation.
 *
 * Only adds/updates entries for loaders present on the new route. Entries for loaders that are NOT
 * on the new route are left untouched — their AsyncSignals keep their prior values, and no track()
 * fires to invalidate them. If the user navigates back to a route where the loader IS present, the
 * path updates and the signal re-fetches. This is the "stale is fine by default" contract: readers
 * see old data until new data arrives.
 */
export const updateRouteLoaderPaths = (
  ctx: RouteLoaderCtx,
  loaderPaths: Record<string, string> | undefined,
  pageUrl: URL
) => {
  if (!isServer) {
    ctx.pagePathname = pageUrl.pathname;
    ctx.pageSearch = pageUrl.search;
  }
  if (loaderPaths) {
    for (const key in loaderPaths) {
      ctx.loaderPaths[key] = loaderPaths[key];
    }
  }
};

export const getModuleRouteLoaders = (mods: readonly (RouteModule | undefined)[]) => {
  const routeLoaders: LoaderInternal[] = [];
  const seen = new Map<string, LoaderInternal>();
  for (let i = 0; i < mods.length; i++) {
    const mod = mods[i];
    if (!mod) {
      continue;
    }
    for (const key in mod) {
      const value = mod[key as keyof typeof mod];
      if (isLoaderInternal(value)) {
        const existing = seen.get(value.__id);
        if (existing) {
          // Two distinct loaders sharing one __id collide here: the second is dropped and never
          // runs. The usual cause is defining loaders through a shared wrapper that passes an
          // inline QRL to routeLoader$ — the optimizer gives that inline QRL a single hash for all
          // instances. Pass a distinct `id` option (e.g. the wrapped fn's getHash()) to fix it.
          if (isDev && existing !== value) {
            console.warn(
              `Two route loaders share the same id "${value.__id}". Only the first will run; ` +
                `the others are ignored. If they are created by a shared wrapper around ` +
                `routeLoader$, give each loader a distinct \`id\` option.`
            );
          }
          continue;
        }
        seen.set(value.__id, value);
        routeLoaders.push(value);
      }
    }
  }
  return routeLoaders;
};

export const ensureRouteLoaderSignal = (
  loader: LoaderInternal,
  state: RouteLoaderState,
  routeLoaderCtx: RouteLoaderCtx
) => {
  if (isServer && loader.__serializationStrategy === 'never') {
    (state as Record<string, unknown>)[getRouteLoaderValueStateKey(loader.__id)] = _UNINITIALIZED;
  }
  return (state[loader.__id] ||= createRouteLoaderSignal(loader, routeLoaderCtx, state));
};

export const ensureRouteLoaderSignals = (
  mods: readonly (RouteModule | undefined)[],
  state: RouteLoaderState,
  routeLoaderCtx: RouteLoaderCtx
) => {
  const loaders = getModuleRouteLoaders(mods);
  for (let i = 0; i < loaders.length; i++) {
    const loader = loaders[i];
    ensureRouteLoaderSignal(loader, state, routeLoaderCtx);
  }
  return loaders;
};

/**
 * Inject a pre-loaded value into an AsyncSignal while preserving track() subscriptions. Delegates
 * to the core helper which calls invalidate({ __v }) + $computeIfNeeded$() so the compute function
 * runs synchronously, registers subscriptions via track(), and returns the pre-loaded value without
 * fetching. Must go through the core helper because $computeIfNeeded$ is mangled in core builds and
 * not directly callable from this package.
 */
export const setLoaderSignalValue = (signal: AsyncSignal<unknown>, value: unknown) => {
  _injectAsyncSignalValue(signal, value);
};

export const resolveRouteLoaderByHash = (
  routeLoaders: readonly LoaderInternal[],
  loaderId: string
) => {
  return routeLoaders.find((loader) => loader.__id === loaderId);
};

/** Run a loader and return its raw value. Errors/redirects propagate as exceptions. */
export const getRouteLoaderData = async (
  loaderQrl: QRL<(event: RequestEventLoader) => unknown>,
  validators: DataValidator[] | undefined,
  requestEv: RequestEvent
) => {
  const loaderRequestEv = requestEv as unknown as RequestEventLoader;

  const result = await runValidators(requestEv, validators, undefined);
  if (!result.success) {
    return loaderRequestEv.fail(result.status ?? 500, result.error);
  }
  const resolved = await loaderQrl.call(
    loaderRequestEv as unknown as ServerRequestEventLoader,
    loaderRequestEv
  );
  const value = typeof resolved === 'function' ? resolved() : resolved;
  if (isDev) {
    verifySerializable(value, loaderQrl);
  }
  return value;
};

export const loadRouteLoaderByQrl = (
  loaderId: string,
  loaderQrl: QRL<(event: RequestEventLoader) => unknown>,
  validators: DataValidator[] | undefined,
  requestEv: RequestEvent
) => {
  const values = getRouteLoaderValues(requestEv);
  if (loaderId in values) {
    return Promise.resolve(values[loaderId]);
  }

  const promises = getRouteLoaderPromises(requestEv);
  let promise = promises[loaderId];
  if (!promise) {
    promise = getRouteLoaderData(loaderQrl, validators, requestEv).then(
      (value) => {
        values[loaderId] = value;
        return value;
      },
      (err) => {
        delete promises[loaderId];
        throw err;
      }
    );
    promises[loaderId] = promise;
  }
  return promise;
};

/** @internal */
export const getLoaderRequestEvent = (
  loader: LoaderInternal,
  requestEv: RequestEvent
): RequestEvent => {
  let rootRequestEv: RequestEvent = requestEv.sharedMap.get(REQUEST_ROUTE_LOADER_ROOT_EVENT);
  if (!rootRequestEv) {
    // Store the original request for child loaders
    rootRequestEv = requestEv;
    requestEv.sharedMap.set(REQUEST_ROUTE_LOADER_ROOT_EVENT, rootRequestEv);
  }

  const url = new URL(rootRequestEv.url);
  const pathname = globalThis.__STRICT_LOADERS__
    ? getRouteLoaderCtx(rootRequestEv).loaderPaths[loader.__id] || rootRequestEv.url.pathname
    : rootRequestEv.url.pathname;
  const filteredSearch = loader.__search
    ? filterSearchParams(url.searchParams, loader.__search)
    : rootRequestEv.url.search;
  if (pathname === rootRequestEv.url.pathname && filteredSearch === rootRequestEv.url.search) {
    return rootRequestEv;
  }

  let events: Map<string, RequestEvent> = rootRequestEv.sharedMap.get(REQUEST_ROUTE_LOADER_EVENTS);
  if (!events) {
    events = new Map();
    rootRequestEv.sharedMap.set(REQUEST_ROUTE_LOADER_EVENTS, events);
  }

  const eventKey = `${pathname}\n${filteredSearch}`;
  let loaderRequestEv = events.get(eventKey);
  if (!loaderRequestEv) {
    url.pathname = pathname;
    url.search = filteredSearch;
    loaderRequestEv = Object.create(rootRequestEv, {
      pathname: {
        get: () => url.pathname,
        enumerable: true,
      },
      query: {
        get: () => url.searchParams,
        enumerable: true,
      },
      url: {
        value: url,
        enumerable: true,
      },
    }) as RequestEvent;
    events.set(eventKey, loaderRequestEv);
  }
  return loaderRequestEv;
};

export const loadRouteLoader = (loader: LoaderInternal, requestEv: RequestEvent) =>
  loadRouteLoaderByQrl(
    loader.__id,
    loader.__qrl,
    loader.__validators,
    getLoaderRequestEvent(loader, requestEv)
  );

/** Run a loader and wrap the result in a LoaderResponse envelope. Catches redirects/errors. */
export const getRouteLoaderResponse = async (
  loaderQrl: QRL<(event: RequestEventLoader) => unknown>,
  validators: DataValidator[] | undefined,
  requestEv: RequestEvent
): Promise<LoaderResponse> => {
  try {
    const value = await getRouteLoaderData(loaderQrl, validators, requestEv);
    if (value && typeof value === 'object' && (value as any).failed) {
      return { e: new ServerError(requestEv.status(), value) };
    }
    return { d: value };
  } catch (err) {
    if (err instanceof RedirectMessage) {
      const location = requestEv.headers.get('Location') || '/';
      requestEv.headers.delete('Location');
      return { r: location };
    }
    if (err instanceof ServerError) {
      return { e: err };
    }
    throw err;
  }
};

/** @internal */
export const routeLoaderQrl = ((
  loaderQrl: QRL<(event: RequestEventLoader) => unknown>,
  ...rest: (LoaderOptions | DataValidator)[]
): LoaderInternal => {
  const {
    id,
    validators,
    serializationStrategy,
    expires,
    poll,
    eTag,
    cacheKey,
    search,
    allowStale,
  } = getLoaderOptions(rest);

  function loader() {
    const state = _resolveContextWithoutSequentialScope(RouteStateContext)!;
    let signal = state[loader.__id];
    if (!signal) {
      const routeLoaderCtx = _resolveContextWithoutSequentialScope(RouteLoaderCtxContext)!;
      signal = ensureRouteLoaderSignal(loader, state, routeLoaderCtx);
    }
    void signal.promise();
    return signal;
  }

  loader.__brand = 'server_loader' as const;
  loader.__qrl = loaderQrl;
  loader.__validators = validators;
  // Allow an explicit `id` to override the QRL hash. This is essential when a loader
  // is created through a shared wrapper (e.g. a helper that calls routeLoader$ with an
  // inline QRL): the optimizer gives that inline QRL a single hash for all instances, so
  // without an override every wrapped loader would collide on the same __id and all but
  // one would be deduped away in getModuleRouteLoaders.
  loader.__id = id ?? loaderQrl.getHash();
  loader.__serializationStrategy = serializationStrategy;
  loader.__expires = expires ?? 120_000; // 2 minutes
  loader.__poll = poll ?? false;
  loader.__eTag = eTag;
  loader.__cacheKey = cacheKey;
  loader.__search = search;
  loader.__allowStale = allowStale;
  Object.freeze(loader);
  return loader;
}) as LoaderConstructorQRL;

/**
 * Define a route loader that fetches data before the route renders.
 *
 * Route loaders run on the server during SSR and return data as an `AsyncSignal`. On the client,
 * loaders automatically re-fetch when the route changes (SPA navigation). Each loader gets its own
 * JSON endpoint (`q-loader-{id}.{hash}.json`), so only the loaders present on the target route are
 * fetched.
 *
 * **Important:** Route loader data uses Qwik's custom serialization format, not standard JSON. This
 * means the data supports features like circular references, Dates, and other non-JSON types, but
 * it cannot be consumed by external clients expecting plain JSON.
 *
 * ## Options
 *
 * - `search: string[]`: Allowlist of URL search params the loader depends on. Only listed params are
 *   sent in the request and changes to other params are ignored. During SSR and loader JSON
 *   requests, the loader's request event is filtered to those params too. `search: []` means no
 *   search params are sent and only route path changes trigger a re-fetch.
 * - `allowStale: false`: Clears the previous value when re-fetching, so components see a loading
 *   state instead of stale data during navigation. Useful when old data would be confusing.
 * - `eTag`: Enable ETag-based caching. Can be `true` (auto-hash), a string, or a function.
 * - `expires` / `poll`: Control client-side caching and polling behavior.
 *
 * The `strictLoaders` Vite plugin option applies `search: []` globally for all loaders that don't
 * specify an explicit `search` option.
 *
 * @public
 */
export const routeLoader$: LoaderConstructor = /*#__PURE__*/ implicit$FirstArg(routeLoaderQrl);

async function runValidators(
  requestEv: RequestEvent,
  validators: DataValidator[] | undefined,
  data: unknown
) {
  let lastResult: ValidatorReturn = {
    success: true,
    data,
  };
  if (validators) {
    for (let i = 0; i < validators.length; i++) {
      const validator = validators[i];
      lastResult = await validator.validate(requestEv, data);
      if (!lastResult.success) {
        return lastResult;
      }
      data = lastResult.data;
    }
  }
  return lastResult;
}

function verifySerializable(data: any, qrl: QRL) {
  try {
    _verifySerializable(data, undefined);
  } catch (error: any) {
    if (error instanceof Error && qrl.dev) {
      (error as any).loc = qrl.dev;
    }
    throw error;
  }
}
