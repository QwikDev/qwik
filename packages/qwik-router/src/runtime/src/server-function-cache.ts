import type { ValueOrPromise } from '@qwik.dev/core';
import type { RequestEventBase } from './types';

type ServerFunctionCacheRecord = unknown;

/** @public */
export type CacheStoreName = 'memory' | 'request';

/** @public */
export type CacheScope = 'request' | 'private' | 'public';

/** @public */
export interface QwikCacheResourceConfig {
  target: ServerFunctionCacheTarget;
  policy?: string;
  tags?: readonly string[];
  vary?: readonly ServerFunctionCacheTarget[];
}

/** @public */
export interface QwikCacheComponentConfig {
  target: unknown;
  policy?: string;
  tags?: readonly string[];
  vary?: readonly ServerFunctionCacheTarget[];
}

/** @public */
export interface QwikCacheConfig {
  defaults?: {
    resources?: {
      store?: CacheStoreName;
      scope?: CacheScope;
      dedupe?: boolean;
      namespace?: string;
    };
  };
  optimize?: {
    resources?: Record<string, QwikCacheResourceConfig>;
    components?: Record<string, QwikCacheComponentConfig>;
  };
}

/** @public */
export type ServerFunctionCacheTarget = {
  getHash?: () => string;
  __qwik_server_resource_hash__?: string;
};

export interface ServerFunctionCacheOptions {
  enabled?: boolean;
  memory?: boolean;
  request?: boolean;
  namespace?: string;
  resourceHashes?: ReadonlySet<string> | null;
}

export interface ServerFunctionCacheStats {
  misses: number;
  requestHits: number;
  memoryHits: number;
  inflightHits: number;
  keySkips: number;
}

const DEFAULT_OPTIONS: Required<ServerFunctionCacheOptions> = {
  enabled: false,
  memory: false,
  request: true,
  namespace: 'qwik-server-function',
  resourceHashes: null,
};

const REQUEST_CACHE_KEY = '__qwik_server_function_cache__';

let options = { ...DEFAULT_OPTIONS };
let stats = createStats();

const memoryCache = new Map<string, ServerFunctionCacheRecord>();
const memoryInflight = new Map<string, Promise<ServerFunctionCacheRecord>>();

/** @internal */
export const _setServerFunctionCacheOptionsForTest = (next: ServerFunctionCacheOptions) => {
  options = {
    ...options,
    ...next,
  };
};

/**
 * Defines a server-only cache config object.
 *
 * @public
 */
export const defineCacheConfig = <T extends QwikCacheConfig>(config: T): T => config;

/** @internal */
export const configureCacheForServer = (config: QwikCacheConfig) => {
  const resources = config.optimize?.resources ?? {};
  const resourceHashes = new Set<string>();
  for (const resource of Object.values(resources)) {
    const hash = getServerFunctionResourceHash(resource.target);
    if (hash) {
      resourceHashes.add(hash);
    }
  }

  const defaults = config.defaults?.resources;
  options = {
    ...options,
    enabled: resourceHashes.size > 0,
    memory: defaults?.store === 'memory',
    request: defaults?.dedupe !== false,
    namespace: defaults?.namespace ?? options.namespace,
    resourceHashes,
  };
};

/**
 * Configure the prototype server/cache registry for the current server runtime.
 *
 * This must be called from server-only app code, such as a `.server.ts` module imported by the SSR
 * entry. The config object itself is not serialized to the browser.
 *
 * @public
 */
export const configureCache = configureCacheForServer;

/** @internal */
export const getServerFunctionResourceHash = (target: unknown): string | null => {
  if (!target || typeof target !== 'function') {
    return null;
  }
  const cacheTarget = target as ServerFunctionCacheTarget;
  return cacheTarget.__qwik_server_resource_hash__ ?? cacheTarget.getHash?.() ?? null;
};

/** @internal */
export const _resetServerFunctionCacheForTest = () => {
  options = { ...DEFAULT_OPTIONS };
  stats = createStats();
  memoryCache.clear();
  memoryInflight.clear();
};

/** @internal */
export const _getServerFunctionCacheStatsForTest = (): ServerFunctionCacheStats => {
  return { ...stats };
};

/** @internal */
export const createServerFunctionCacheKey = (
  qrlHash: string,
  args: readonly unknown[] | undefined,
  namespace = options.namespace
): string | null => {
  const serializedArgs = stableSerialize(args ?? []);
  if (serializedArgs === null) {
    return null;
  }
  return `${namespace}:${qrlHash}:${serializedArgs}`;
};

/** @internal */
export const runServerFunctionWithCache = async <T>(
  requestEvent: RequestEventBase | undefined,
  qrlHash: string,
  args: readonly unknown[] | undefined,
  run: () => ValueOrPromise<T>
): Promise<T> => {
  if (!options.enabled) {
    return run();
  }
  if (options.resourceHashes && !options.resourceHashes.has(qrlHash)) {
    return run();
  }

  const key = createServerFunctionCacheKey(qrlHash, args);
  if (key === null) {
    stats.keySkips++;
    return run();
  }

  const requestCache = options.request ? getRequestCache(requestEvent) : undefined;
  if (requestCache?.has(key)) {
    stats.requestHits++;
    return requestCache.get(key) as T | Promise<T>;
  }

  if (options.memory && memoryCache.has(key)) {
    stats.memoryHits++;
    const value = memoryCache.get(key) as T;
    requestCache?.set(key, value);
    return value;
  }

  if (options.memory && memoryInflight.has(key)) {
    stats.inflightHits++;
    return memoryInflight.get(key) as Promise<T>;
  }

  stats.misses++;
  const promise = Promise.resolve().then(run) as Promise<T>;
  requestCache?.set(key, promise);
  if (options.memory) {
    memoryInflight.set(key, promise);
  }

  try {
    const value = await promise;
    if (isAsyncIterable(value)) {
      requestCache?.delete(key);
      return value;
    }
    requestCache?.set(key, value);
    if (options.memory) {
      memoryCache.set(key, value);
    }
    return value;
  } catch (err) {
    requestCache?.delete(key);
    throw err;
  } finally {
    if (options.memory) {
      memoryInflight.delete(key);
    }
  }
};

const getRequestCache = (
  requestEvent: RequestEventBase | undefined
): Map<string, ServerFunctionCacheRecord> | undefined => {
  const sharedMap = requestEvent?.sharedMap;
  if (!sharedMap) {
    return undefined;
  }
  let requestCache = sharedMap.get(REQUEST_CACHE_KEY) as
    | Map<string, ServerFunctionCacheRecord>
    | undefined;
  if (!requestCache) {
    sharedMap.set(REQUEST_CACHE_KEY, (requestCache = new Map()));
  }
  return requestCache;
};

function createStats(): ServerFunctionCacheStats {
  return {
    misses: 0,
    requestHits: 0,
    memoryHits: 0,
    inflightHits: 0,
    keySkips: 0,
  };
}

const stableSerialize = (value: unknown): string | null => {
  try {
    return stableSerializeValue(value, new Set());
  } catch {
    return null;
  }
};

const stableSerializeValue = (value: unknown, seen: Set<object>): string => {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean': {
      return JSON.stringify(value);
    }
    case 'undefined': {
      return '{"$undefined":true}';
    }
    case 'bigint': {
      return `{"$bigint":${JSON.stringify(value.toString())}}`;
    }
    case 'object': {
      if (isUnsupportedObject(value)) {
        throw new Error('Unsupported server function cache key input');
      }
      if (seen.has(value)) {
        throw new Error('Circular server function cache key input');
      }
      seen.add(value);
      try {
        if (Array.isArray(value)) {
          return `[${value.map((item) => stableSerializeValue(item, seen)).join(',')}]`;
        }
        if (value instanceof Date) {
          return `{"$date":${JSON.stringify(value.toJSON())}}`;
        }
        if (typeof URL !== 'undefined' && value instanceof URL) {
          return `{"$url":${JSON.stringify(value.toString())}}`;
        }
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
          throw new Error('Unsupported server function cache key input');
        }
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0
        );
        return `{${entries
          .map(([key, item]) => `${JSON.stringify(key)}:${stableSerializeValue(item, seen)}`)
          .join(',')}}`;
      } finally {
        seen.delete(value);
      }
    }
    default: {
      throw new Error('Unsupported server function cache key input');
    }
  }
};

const isUnsupportedObject = (value: object): boolean => {
  return (
    (typeof FormData !== 'undefined' && value instanceof FormData) ||
    (typeof Headers !== 'undefined' && value instanceof Headers) ||
    (typeof Request !== 'undefined' && value instanceof Request) ||
    (typeof Response !== 'undefined' && value instanceof Response) ||
    (typeof Blob !== 'undefined' && value instanceof Blob)
  );
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> => {
  return !!value && typeof value === 'object' && Symbol.asyncIterator in value;
};
