import { getBasePathname } from './router-config';
import {
  implicit$FirstArg,
  isDev,
  isServer,
  untrack,
  useComputed$,
  useContext,
  type ComputedSignal,
  type NoSerialize,
  type QRL,
} from '@qwik.dev/core';
import {
  _deserialize,
  _verifySerializable,
  _UNINITIALIZED,
  createOwner,
  disposeSubscriber,
  runWithOwner,
  SerializerSymbol,
  type Computed,
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
import {
  ServerError,
  throwIfControlFlowSignal,
} from '../../middleware/request-handler/server-error';
import { ensureSlash } from '../../utils/pathname';
import { DEFAULT_LOADERS_SERIALIZATION_STRATEGY } from './constants';
import { RouteLoaderCtxContext, RouteStateContext } from './contexts';
import type {
  DataValidator,
  LoaderConstructor,
  LoaderConstructorQRL,
  LoaderInternal,
  LoaderOptions,
  PathParams,
  RequestEvent,
  RequestEventLoader,
  RouteNavigate,
  RouteModule,
  ValidatorReturn,
} from './types';

/**
 * Route loaders read data before the route rendering starts, based on the route being navigated to.
 * They automatically update when the route changes on the client.
 *
 * They are represented by a ComputedSignal.
 */

const REQUEST_ROUTE_LOADER_STATE = '@routeLoaderState';
const REQUEST_LOADER_PATHS_STORE = '@loaderPathsStore';
const REQUEST_LOADER_PARAMS_STORE = '@loaderParamsStore';
const REQUEST_ROUTE_LOADERS = '@routeLoaders';
const REQUEST_ROUTE_LOADER_PROMISES = '@routeLoaderPromises';
const REQUEST_ROUTE_LOADER_EVENTS = '@routeLoaderEvents';
const REQUEST_ROUTE_LOADER_ROOT_EVENT = '@routeLoaderRootEvent';
const ROUTE_LOADER_VALUE_PREFIX = '__qwik_route_loader_value__';

/** Header name sent by client to tell the server the actual page URL for loader requests. */
export const FULLPATH_HEADER = 'X-Qwik-fullpath';
/** Dev route hint that preserves the loader URL. */
export const ROUTE_PATH_HEADER = 'X-Qwik-route-path';

/**
 * Response envelope for loader.json requests. Exactly one of `d`, `r`, or `e` is set.
 *
 * - `d` — data: the loader's return value (including a `fail()` result, which is plain data)
 * - `r` — redirect: URL to navigate to (from `throw redirect()`)
 * - `e` — error: a ServerError (from a thrown `ServerError` / `error()`)
 */
export type LoaderResponse = {
  d?: unknown;
  r?: string;
  e?: InstanceType<typeof ServerError>;
};

/**
 * Result of a loader fetch: the raw serialized envelope text, or a synthesized redirect for HTTP
 * 3xx responses. Deserialization happens at the signal so unchanged text can skip it entirely.
 */
export type LoaderFetchResult = {
  raw?: string;
  r?: string;
};

/**
 * Per-navigation fetch dedupe: shares in-flight and completed fetches (hover prefetch → click nav)
 * and prevents repeat hover fetches. Cleared after each navigation kicks off its loader fetches;
 * across navigations the browser HTTP cache is the freshness authority.
 */
let navFetchCache = new Map<string, Promise<LoaderFetchResult | undefined>>();

export const clearNavFetchCache = () => {
  navFetchCache = new Map();
};

const isRedirectStatus = (status: number) => status >= 300 && status < 400;

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

/** Shared SSR paths and client-only loader navigation state. */
export type RouteLoaderCtx = {
  loaderPaths: Record<string, string | undefined>;
  /** SPA navigation function. Client-only and intentionally omitted from SSR state. */
  goto?: NoSerialize<RouteNavigate>;
  /** Client manifest hash for q-loader fetch URLs. */
  manifestHash?: string;
};

type LoaderRequest = {
  routePath: string;
  pageUrl: string;
  active: boolean;
  hash?: string;
  /** An interrupting navigation aborted this request's fetch before it settled. */
  isAborted?: boolean;
};

type LoaderNavigation = {
  requests: Map<ComputedSignal<unknown>, LoaderRequest>;
  paths: Record<string, string | undefined>;
  pageUrl: string;
};

type ClientRouteLoaders = {
  current: LoaderNavigation;
  committed: LoaderNavigation;
  navCount?: number;
  navigationKey?: object;
};

const clientRouteLoaders = new WeakMap<RouteLoaderCtx, ClientRouteLoaders>();

export function getClientRouteLoaders(ctx: RouteLoaderCtx, pageUrl?: string): ClientRouteLoaders {
  let client = clientRouteLoaders.get(ctx);
  if (!client) {
    const current = {
      requests: new Map(),
      paths: { ...ctx.loaderPaths },
      pageUrl: pageUrl || location.href,
    };
    client = { current, committed: current };
    clientRouteLoaders.set(ctx, client);
  }
  return client;
}

function getLoaderRequest(ctx: RouteLoaderCtx, state: RouteLoaderState, id: string, hash: string) {
  return untrack(() => {
    const client = getClientRouteLoaders(ctx);
    const { requests, paths, pageUrl } = client.current;
    let request = requests.get(state[id]);
    if (!request) {
      const path = paths[id] || paths[hash];
      request = {
        routePath: path || new URL(pageUrl).pathname,
        pageUrl,
        active: client.navCount === undefined || !!path,
        hash,
      };
      requests.set(state[id], request);
    }
    return request;
  });
}

function assertCurrentLoaderRequest(
  ctx: RouteLoaderCtx,
  signal: ComputedSignal<unknown>,
  request: LoaderRequest,
  abortSignal: AbortSignal
) {
  abortSignal.throwIfAborted();
  if (!request.active || clientRouteLoaders.get(ctx)?.current.requests.get(signal) !== request) {
    throw new DOMException(isDev ? 'Route loader navigation was superseded' : '', 'AbortError');
  }
}

export type RouteLoaderState = Record<string, ComputedSignal<unknown>>;

const getRouteLoaderValueStateKey = (loaderId: string) => `${ROUTE_LOADER_VALUE_PREFIX}${loaderId}`;

class ServerRouteLoaderCapture {
  constructor(
    readonly hash: string,
    readonly qrl: QRL<(event: RequestEventLoader) => unknown>,
    readonly validators: DataValidator[] | undefined,
    readonly blockSSR: boolean,
    readonly requestEv?: RequestEvent
  ) {}

  load() {
    const requestEv = this.requestEv;
    if (!requestEv) {
      throw new Error('Unable to determine the current RequestEvent.');
    }
    // Use pre-computed value from loadersMiddleware if available,
    // to avoid re-running the loader after the response stream is open.
    const values = getRouteLoaderValues(requestEv);
    if (this.hash in values) {
      return values[this.hash];
    }
    // A background (blockSSR:false) loader must not touch the page response.
    const ev = this.blockSSR ? requestEv : detachResponseFromEvent(requestEv);
    return loadRouteLoaderByQrl(this.hash, this.qrl, this.validators, ev);
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

/**
 * Fetch a single loader's raw JSON response from the server.
 *
 * URL pattern: `{basePath}{routePath}/q-loader-{loaderId}.{manifestHash}.json`
 */
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
): Promise<LoaderFetchResult | undefined> => {
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
  if (pageUrl && pageUrl.pathname !== pathBase) {
    if (!globalThis.__STRICT_LOADERS__) {
      headers[FULLPATH_HEADER] = pageUrl.pathname;
    } else if (isDev) {
      headers[ROUTE_PATH_HEADER] = pageUrl.pathname;
    }
  }

  const cacheKey = `${url}\n${headers[FULLPATH_HEADER] ?? ''}`;
  const cache = navFetchCache;
  if (!opts?.ignoreCache) {
    const entry = cache.get(cacheKey);
    if (entry) {
      return opts?.signal ? wrapWithAbort(entry, opts.signal) : entry;
    }
  }

  const request = async (): Promise<LoaderFetchResult | undefined> => {
    opts?.signal?.throwIfAborted();
    const response = await fetch(url, {
      signal: opts?.signal,
      cache: opts?.ignoreCache ? 'reload' : 'default',
      headers,
    });
    opts?.signal?.throwIfAborted();
    // Middleware redirects produce HTTP 3xx — convert to a redirect result
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
    const raw = await response.text();
    opts?.signal?.throwIfAborted();
    return { raw };
  };

  if (opts?.ignoreCache) {
    return request();
  }

  if (opts?.signal) {
    // Don't share an abortable request while pending, but reuse it after completion.
    return request().then((value) => {
      opts.signal!.throwIfAborted();
      if (value !== undefined && !cache.has(cacheKey)) {
        cache.set(cacheKey, Promise.resolve(value));
      }
      return value;
    });
  }

  const promise = request().then(
    (value) => {
      if (value === undefined) {
        cache.delete(cacheKey);
      }
      return value;
    },
    (err) => {
      cache.delete(cacheKey);
      throw err;
    }
  );
  cache.set(cacheKey, promise);
  return promise;
};

const createRouteLoaderSignal = (
  loader: LoaderInternal,
  routeLoaderCtx: RouteLoaderCtx,
  state: RouteLoaderState,
  requestEv?: RequestEvent
) => {
  const id = loader.__id;
  const stateValues = state as Record<string, unknown>;
  const resumeValueKey = getRouteLoaderValueStateKey(id);
  const capture = isServer
    ? new ServerRouteLoaderCapture(
        id,
        loader.__qrl,
        loader.__validators,
        loader.__blockSSR,
        requestEv ?? getRequestEvent()
      )
    : id;
  const searchFilter = loader.__search;
  const loaderHash = isDev ? loader.__qrl.getHash() : id;
  // Keep the raw payload to preserve object identity when data is unchanged.
  const lastFetch: { raw?: string } = {};
  // Route-wide state: it must outlive the component that happened to reach for it first.
  return runWithOwner(createOwner(null), () =>
    useComputed$(
      (ctx) => {
        const { info, previous, abortSignal } = ctx;
        const hasInjectedValue = !!info && typeof info === 'object' && '__v' in (info as object);
        // Pre-loaded value injection (from middleware via setLoaderSignalValue, or from
        // an action response).
        if (hasInjectedValue) {
          const value = (info as { __v: unknown }).__v;
          if (!isServer && resumeValueKey in stateValues) {
            stateValues[resumeValueKey] = value;
          }
          // The injected value may differ from the last fetched text; don't skip the next fetch
          lastFetch.raw = undefined;
          return value;
        }
        if (isServer) {
          // synchronous when the middleware precomputed the value — sync readers (tasks
          // tracking the loader) must never see a pending compute in the standard flow
          return (capture as ServerRouteLoaderCapture).load();
        }
        // the async client tail keeps the compute itself synchronous up to the first await
        return (async () => {
          const request = getLoaderRequest(routeLoaderCtx, state, id, loaderHash);
          if (!request.active) {
            if (previous === undefined) {
              return new Promise((_, reject) => {
                abortSignal.throwIfAborted();
                abortSignal.addEventListener('abort', () => reject(abortSignal.reason), {
                  once: true,
                });
              });
            }
            return previous;
          }
          const pageUrl = new URL(request.pageUrl);
          const mHash = untrack(() => routeLoaderCtx.manifestHash) || 'dev';
          const basePath = getBasePathname();
          const needsResumeFetch = stateValues[resumeValueKey] === _UNINITIALIZED;
          const fetchRoutePath = request.routePath;

          // Build a URL with only the allowed search params for the fetch
          let fetchUrl = pageUrl;
          if (searchFilter) {
            fetchUrl = new URL(pageUrl.href);
            fetchUrl.search = filterSearchParams(pageUrl.searchParams, searchFilter);
          }

          const result = await fetchRouteLoaderData(id, fetchRoutePath, mHash, {
            pageUrl: fetchUrl,
            basePath,
            ignoreCache: info === true,
            signal: abortSignal,
          });
          assertCurrentLoaderRequest(routeLoaderCtx, state[id], request, abortSignal);
          if (!result) {
            throw new Error(`Loader ${id} returned empty response`);
          }
          let response: LoaderResponse;
          if (result.raw === undefined) {
            response = result;
          } else {
            if (result.raw === lastFetch.raw && previous !== undefined) {
              return previous;
            }
            response = (await _deserialize<LoaderResponse>(result.raw)) as LoaderResponse;
            if (!response) {
              throw new Error(`Loader ${id} returned empty response`);
            }
          }
          assertCurrentLoaderRequest(routeLoaderCtx, state[id], request, abortSignal);
          if (response.r) {
            // Superseded requests cannot redirect the current navigation.
            const goto = routeLoaderCtx.goto;
            if (goto) {
              goto(response.r, { replaceState: true });
            } else {
              location.href = response.r;
            }
            return previous;
          }
          if (response.e) {
            // Error — throw so signal enters error state
            throw response.e;
          }
          lastFetch.raw = result.raw;
          if (needsResumeFetch) {
            stateValues[resumeValueKey] = response.d;
          }
          return response.d;
        })();
      },

      {
        serializationStrategy: loader.__serializationStrategy,
      }
    )
  );
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
  let serializationStrategy: SerializationStrategy = DEFAULT_LOADERS_SERIALIZATION_STRATEGY();
  let cacheControl: LoaderOptions['cacheControl'] | undefined;
  let eTag: LoaderOptions['eTag'] | undefined;
  let cacheKey: LoaderOptions['cacheKey'] | undefined;
  let search: string[] | undefined;
  let blockSSR = true;
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
        if ('cacheControl' in options) {
          cacheControl = options.cacheControl;
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
        if (options.blockSSR === false) {
          if (!__EXPERIMENTAL__.blockSSR) {
            throw new Error(
              '`blockSSR: false` is an experimental feature and is not enabled. Please enable the feature flag by adding `experimental: ["blockSSR"]` to your qwikVite plugin options.'
            );
          }
          blockSSR = false;
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
    cacheControl,
    eTag,
    cacheKey,
    search,
    blockSSR,
  };
};

/**
 * Returns the current RequestEvent if possible. Only usable on the server, and only during request
 * processing.
 *
 * @public
 */
export const getRequestEvent = (thisArg?: unknown): RequestEvent | undefined => {
  if (!isServer) {
    throw new Error('getRequestEvent() can only be used on the server.');
  }
  return _asyncRequestStore?.getStore() || [thisArg].find(isRequestEvent);
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

/** Clear loader state before rendering a route-independent error boundary. */
export function clearRouteLoaderData(requestEv: RequestEventBase) {
  requestEv.sharedMap.delete(REQUEST_ROUTE_LOADER_STATE);
  requestEv.sharedMap.delete(REQUEST_ROUTE_LOADER_VALUES);
  requestEv.sharedMap.delete(REQUEST_ROUTE_LOADER_PROMISES);
  requestEv.sharedMap.delete(REQUEST_ROUTE_LOADER_EVENTS);
  requestEv.sharedMap.delete(REQUEST_ROUTE_LOADER_ROOT_EVENT);
  requestEv.sharedMap.delete(REQUEST_ROUTE_LOADERS);
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

export function getRouteLoaderParams(
  requestEv: RequestEventBase
): Record<string, PathParams | undefined> {
  let params = requestEv.sharedMap.get(REQUEST_LOADER_PARAMS_STORE);
  if (!params) {
    params = {};
    requestEv.sharedMap.set(REQUEST_LOADER_PARAMS_STORE, params);
  }
  return params;
}

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

/**
 * Loader ids declared `cacheControl: 'immutable'`. Their data cannot change until a rebuild, so
 * nav-wide invalidation skips them; they still re-fetch when their tracked URL inputs change.
 * Registered on every nav via ensureRouteLoaderSignal, so resumed signals are covered too.
 */
const immutableLoaderIds = new Set<string>();

export const isImmutableLoader = (loaderId: string) => immutableLoaderIds.has(loaderId);

export function abortRouteLoaderNavigation(ctx: RouteLoaderCtx) {
  for (const [signal, request] of clientRouteLoaders.get(ctx)?.current.requests ?? []) {
    if (!request.active) {
      // Probing a departed loader would start its compute and wake the outgoing page.
      continue;
    }
    if (signal.untrackedPending) {
      request.isAborted = true;
    }
    signal.abort();
  }
}

/** Search-filtered loaders ignore changes to unlisted params. */
function hasSameListedSearch(previous: URL, next: URL, search: string[] | undefined) {
  return (
    !!search &&
    previous.pathname === next.pathname &&
    filterSearchParams(previous.searchParams, search) ===
      filterSearchParams(next.searchParams, search)
  );
}

export function prepareRouteLoaders(
  mods: readonly (RouteModule | undefined)[],
  state: RouteLoaderState,
  ctx: RouteLoaderCtx,
  paths: Record<string, string> | undefined,
  pageUrl: URL,
  previousUrl: URL,
  navCount: number,
  forceIds?: readonly string[] | null,
  navigationKey?: object
) {
  const client = getClientRouteLoaders(ctx, previousUrl.href);
  if (navigationKey && client.navigationKey === navigationKey) {
    return ensureRouteLoaderSignals(mods, state, ctx);
  }
  const previous = client.current;
  if (client.navCount === undefined) {
    for (const id in state) {
      if (!id.startsWith(ROUTE_LOADER_VALUE_PREFIX)) {
        getLoaderRequest(ctx, state, id, id);
      }
    }
  }
  client.navCount = navCount;
  client.navigationKey = navigationKey;
  const current = (client.current = {
    requests: new Map(),
    paths: { ...paths },
    pageUrl: pageUrl.href,
  });
  const loaders = ensureRouteLoaderSignals(mods, state, ctx);
  const routeLoaders = new Map<string, LoaderInternal>();
  for (const loader of loaders) {
    routeLoaders.set(loader.__id, loader);
    current.paths[loader.__id] ||= current.paths[loader.__qrl.getHash()] || pageUrl.pathname;
  }
  for (const id in state) {
    if (id.startsWith(ROUTE_LOADER_VALUE_PREFIX)) {
      continue;
    }
    const signal = state[id];
    const old = previous.requests.get(signal);
    const loader = routeLoaders.get(id);
    const hash = loader?.__qrl.getHash() || old?.hash;
    const routePath = current.paths[id] || (hash && current.paths[hash]);
    if (!routePath) {
      if (old) {
        current.requests.set(signal, { ...old, active: false });
      }
      signal.abort();
      continue;
    }
    const keepRequest =
      old?.active &&
      !old.isAborted &&
      old.routePath === routePath &&
      (old.pageUrl === pageUrl.href
        ? isImmutableLoader(id)
        : hasSameListedSearch(new URL(old.pageUrl), pageUrl, loader?.__search));
    current.requests.set(
      signal,
      keepRequest ? old : { routePath, pageUrl: pageUrl.href, active: true, hash }
    );
    ctx.loaderPaths[id] = routePath;
    const force = forceIds === null || forceIds?.some((value) => value === id || value === hash);
    if (force) {
      signal.invalidate(true);
    } else if (old && !keepRequest) {
      signal.invalidate();
    }
  }
  return loaders;
}

function pruneRouteLoaders(state: RouteLoaderState, ctx: RouteLoaderCtx) {
  const { requests } = clientRouteLoaders.get(ctx)!.current;
  const paths: Record<string, string> = {};
  for (const id in state) {
    if (id.startsWith(ROUTE_LOADER_VALUE_PREFIX)) {
      continue;
    }
    const signal = state[id];
    const request = requests.get(signal);
    if (request?.active) {
      paths[id] = request.routePath;
    } else {
      disposeSubscriber(signal as Computed<unknown>);
      requests.delete(signal);
      delete state[id];
      delete (state as Record<string, unknown>)[getRouteLoaderValueStateKey(id)];
    }
  }
  ctx.loaderPaths = paths;
}

export function commitRouteLoaders(state: RouteLoaderState, ctx: RouteLoaderCtx, navCount: number) {
  const client = clientRouteLoaders.get(ctx);
  if (!client || client.navCount !== navCount) {
    return;
  }
  pruneRouteLoaders(state, ctx);
  client.committed = client.current;
}

export function restoreRouteLoaders(
  state: RouteLoaderState,
  ctx: RouteLoaderCtx,
  navCount: number
) {
  const client = clientRouteLoaders.get(ctx);
  if (!client || client.navCount !== navCount) {
    return;
  }
  client.navigationKey = undefined;
  client.current = client.committed;
  pruneRouteLoaders(state, ctx);
  for (const signal of client.current.requests.keys()) {
    signal.invalidate();
  }
}

export const ensureRouteLoaderSignal = (
  loader: LoaderInternal,
  state: RouteLoaderState,
  routeLoaderCtx: RouteLoaderCtx,
  requestEv?: RequestEvent
) => {
  if (loader.__cacheControl === 'immutable') {
    immutableLoaderIds.add(loader.__id);
  }
  const signal = (state[loader.__id] ||= createRouteLoaderSignal(
    loader,
    routeLoaderCtx,
    state,
    requestEv
  ));
  if (isServer && loader.__serializationStrategy === 'never') {
    (state as Record<string, unknown>)[getRouteLoaderValueStateKey(loader.__id)] = _UNINITIALIZED;
  }
  return signal;
};

export const ensureRouteLoaderSignals = (
  mods: readonly (RouteModule | undefined)[],
  state: RouteLoaderState,
  routeLoaderCtx: RouteLoaderCtx,
  requestEv?: RequestEvent
) =>
  untrack(() => {
    const loaders = getModuleRouteLoaders(mods);
    for (const loader of loaders) {
      ensureRouteLoaderSignal(loader, state, routeLoaderCtx, requestEv);
    }
    return loaders;
  });

/** Inject a pre-loaded value into a ComputedSignal while preserving subscriptions. */
export const setLoaderSignalValue = (signal: ComputedSignal<unknown>, value: unknown) => {
  signal.invalidate({ __v: value });
  void signal.promise();
};

export const resolveRouteLoaderByHash = (
  routeLoaders: readonly LoaderInternal[],
  loaderId: string
) => {
  return routeLoaders.find((loader) => matchesRouteLoaderId(loader, loaderId));
};

export const matchesRouteLoaderId = (loader: LoaderInternal, loaderId: unknown): boolean => {
  return (
    typeof loaderId === 'string' &&
    (loader.__id === loaderId || (isDev && loader.__qrl.getHash() === loaderId))
  );
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
  throwIfControlFlowSignal(value);
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
  const params =
    pathname === rootRequestEv.url.pathname
      ? rootRequestEv.params
      : getRouteLoaderParams(rootRequestEv)[loader.__id] || {};

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
    const request = new Request(url, rootRequestEv.request);
    loaderRequestEv = Object.create(rootRequestEv, {
      originalUrl: {
        value: new URL(url),
        enumerable: true,
      },
      params: {
        value: params,
        enumerable: true,
      },
      pathname: {
        get: () => url.pathname,
        enumerable: true,
      },
      query: {
        get: () => url.searchParams,
        enumerable: true,
      },
      request: {
        value: request,
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

/**
 * View of a request event whose response controls (status/headers/redirect/error/fail/cacheControl)
 * are captured locally, so a background (`blockSSR: false`) loader's status/redirect/error surfaces
 * on its own signal instead of mutating the page response. The originals also call `check()`, which
 * throws once SSR streaming has started — a background loader must fail on its signal, not crash.
 */
const detachResponseFromEvent = (requestEv: RequestEvent): RequestEvent => {
  let status = 200;
  const headers = new Headers();
  return Object.create(requestEv, {
    headers: { value: headers, enumerable: true },
    status: {
      value: (statusCode?: number) => {
        if (typeof statusCode === 'number') {
          status = statusCode;
        }
        return status;
      },
      enumerable: true,
    },
    error: {
      value: (statusCode: number, message: unknown) => {
        status = statusCode;
        return new ServerError(statusCode, message);
      },
      enumerable: true,
    },
    redirect: {
      value: (statusCode: number, url: string) => {
        status = statusCode;
        if (url) {
          headers.set('Location', url);
        }
        return new RedirectMessage();
      },
      enumerable: true,
    },
    fail: {
      value: (statusCode: number, data: Record<string, unknown>) => {
        status = statusCode;
        return { failed: true, ...data };
      },
      enumerable: true,
    },
    // A background loader cannot set the page's cache headers.
    cacheControl: { value: () => {}, enumerable: true },
  }) as RequestEvent;
};

export const loadRouteLoader = (loader: LoaderInternal, requestEv: RequestEvent) => {
  const loaderEv = getLoaderRequestEvent(loader, requestEv);
  return loadRouteLoaderByQrl(
    loader.__id,
    loader.__qrl,
    loader.__validators,
    // A background (blockSSR:false) loader must not touch the page response.
    loader.__blockSSR ? loaderEv : detachResponseFromEvent(loaderEv)
  );
};

/** Run a loader and wrap the result in a LoaderResponse envelope. Catches redirects/errors. */
export const getRouteLoaderResponse = async (
  loaderQrl: QRL<(event: RequestEventLoader) => unknown>,
  validators: DataValidator[] | undefined,
  requestEv: RequestEvent
): Promise<LoaderResponse> => {
  try {
    // A fail() result is plain data ({ failed: true, ... }); only thrown errors use `e`.
    const value = await getRouteLoaderData(loaderQrl, validators, requestEv);
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
  const { id, validators, serializationStrategy, cacheControl, eTag, cacheKey, search, blockSSR } =
    getLoaderOptions(rest);

  function loader() {
    const state = useContext(RouteStateContext);
    let signal = state[loader.__id];
    if (!signal) {
      const routeLoaderCtx = useContext(RouteLoaderCtxContext);
      signal = ensureRouteLoaderSignal(loader, state, routeLoaderCtx);
    }
    void signal.promise();
    return signal;
  }

  loader.__brand = 'server_loader' as const;
  loader.__qrl = loaderQrl;
  loader.__validators = validators;
  loader.__id = id ?? loaderQrl.getHash();
  loader.__serializationStrategy = serializationStrategy;
  loader.__cacheControl = cacheControl;
  loader.__eTag = eTag;
  loader.__cacheKey = cacheKey;
  loader.__search = search;
  loader.__blockSSR = blockSSR;
  Object.freeze(loader);
  return loader;
}) as LoaderConstructorQRL;

/**
 * Define a route loader that fetches data before the route renders.
 *
 * Route loaders run on the server during SSR and return data as a `ComputedSignal`. On the client,
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
 * - `eTag`: Enable ETag-based caching. Can be `true` (auto-hash), a string, or a function.
 * - `cacheControl`: Cache-Control for loader JSON responses; the browser HTTP cache controls
 *   client-side freshness. `'immutable'` additionally lets SSG write the loader file.
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
