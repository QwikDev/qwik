import type { ValueOrPromise } from '@qwik.dev/core';
import type { RequestEventBase } from './types';

type ServerFunctionCacheRecord = unknown;
type ComponentHtmlCacheRecord = string;

export type AsyncResourceStateStatus = 'pending' | 'resolved' | 'rejected';

export interface AsyncResourceStateEnvelope {
  key: string;
  qrlHash: string;
  status: AsyncResourceStateStatus;
  source: 'request' | 'memory' | 'inflight' | 'run';
  value?: unknown;
  error?: unknown;
}

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
    components?: {
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

export interface QwikCacheRegistryVaryEntry {
  hash: string;
  name?: string;
}

export interface QwikCacheRegistryResourceEntry {
  name: string;
  hash: string;
  policy?: string;
  tags: readonly string[];
  vary: readonly QwikCacheRegistryVaryEntry[];
}

export interface QwikCacheRegistryComponentEntry {
  name: string;
  ids: readonly string[];
  policy?: string;
  tags: readonly string[];
  vary: readonly QwikCacheRegistryVaryEntry[];
  registry?: {
    id: string;
    qrlHash: string;
    symbol: string;
  };
}

export interface QwikCacheRegistrySnapshot {
  resources: readonly QwikCacheRegistryResourceEntry[];
  components: readonly QwikCacheRegistryComponentEntry[];
}

/** @public */
export type ServerFunctionCacheTarget = {
  getHash?: () => string;
  __qwik_server_resource_hash__?: string;
};

type ComponentRegistryTarget = {
  __qwik_component_registry__?: {
    id: string;
    qrlHash: string;
    symbol: string;
  };
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

export interface ComponentHtmlCacheOptions {
  enabled?: boolean;
  memory?: boolean;
  request?: boolean;
  namespace?: string;
}

export interface ComponentHtmlCacheStats {
  misses: number;
  requestHits: number;
  memoryHits: number;
  inflightHits: number;
  keySkips: number;
  skips: number;
}

const DEFAULT_OPTIONS: Required<ServerFunctionCacheOptions> = {
  enabled: false,
  memory: false,
  request: true,
  namespace: 'qwik-server-function',
  resourceHashes: null,
};

const DEFAULT_COMPONENT_OPTIONS: Required<ComponentHtmlCacheOptions> = {
  enabled: false,
  memory: false,
  request: true,
  namespace: 'qwik-component-html',
};

const REQUEST_CACHE_KEY = '__qwik_server_function_cache__';
const ASYNC_RESOURCE_STATE_KEY = '__qwik_async_resource_state__';
const COMPONENT_REQUEST_CACHE_KEY = '__qwik_component_html_cache__';

let options = { ...DEFAULT_OPTIONS };
let stats = createStats();
let componentOptions = { ...DEFAULT_COMPONENT_OPTIONS };
let componentStats = createComponentStats();

const memoryCache = new Map<string, ServerFunctionCacheRecord>();
const memoryInflight = new Map<string, Promise<ServerFunctionCacheRecord>>();
const componentHtmlMemoryCache = new Map<string, ComponentHtmlCacheRecord>();
const componentHtmlMemoryInflight = new Map<string, Promise<ComponentHtmlCacheRecord>>();
const resourceConfigs = new Map<string, QwikCacheResourceConfig>();
const resourceEntries = new Map<
  string,
  { name: string; hash: string; config: QwikCacheResourceConfig }
>();
const componentTargets = new Map<string, unknown>();
const componentConfigs = new Map<string, QwikCacheComponentConfig>();
const componentEntries = new Map<
  string,
  { name: string; ids: string[]; config: QwikCacheComponentConfig }
>();

/** @internal */
export const _setServerFunctionCacheOptionsForTest = (next: ServerFunctionCacheOptions) => {
  options = {
    ...options,
    ...next,
  };
};

/** @internal */
export const _setComponentHtmlCacheOptionsForTest = (next: ComponentHtmlCacheOptions) => {
  componentOptions = {
    ...componentOptions,
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
  resourceConfigs.clear();
  resourceEntries.clear();
  for (const [name, resource] of Object.entries(resources)) {
    const hash = getServerFunctionResourceHash(resource.target);
    if (hash) {
      resourceHashes.add(hash);
      resourceConfigs.set(hash, resource);
      resourceEntries.set(name, { name, hash, config: resource });
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

  componentTargets.clear();
  componentConfigs.clear();
  componentEntries.clear();
  const components = config.optimize?.components ?? {};
  for (const [name, component] of Object.entries(components)) {
    registerConfiguredComponentTarget(name, component);
  }

  const componentDefaults = config.defaults?.components;
  componentOptions = {
    ...componentOptions,
    enabled: componentTargets.size > 0,
    memory: componentDefaults?.store === 'memory',
    request: componentDefaults?.dedupe !== false,
    namespace: componentDefaults?.namespace ?? componentOptions.namespace,
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
export const getConfiguredComponentTarget = (componentId: string): unknown | null => {
  return componentTargets.get(componentId) ?? null;
};

/** @internal */
export const _resetServerFunctionCacheForTest = () => {
  options = { ...DEFAULT_OPTIONS };
  stats = createStats();
  componentOptions = { ...DEFAULT_COMPONENT_OPTIONS };
  componentStats = createComponentStats();
  memoryCache.clear();
  memoryInflight.clear();
  componentHtmlMemoryCache.clear();
  componentHtmlMemoryInflight.clear();
  resourceConfigs.clear();
  resourceEntries.clear();
  componentTargets.clear();
  componentConfigs.clear();
  componentEntries.clear();
};

/** @internal */
export const _getServerFunctionCacheStatsForTest = (): ServerFunctionCacheStats => {
  return { ...stats };
};

/** @internal */
export const _getComponentHtmlCacheStatsForTest = (): ComponentHtmlCacheStats => {
  return { ...componentStats };
};

/** @internal */
export const getAsyncResourceStateSnapshotForServer = (
  requestEvent: RequestEventBase | undefined
): AsyncResourceStateEnvelope[] => {
  return Array.from(getAsyncResourceStateCache(requestEvent, false)?.values() ?? []);
};

/** @internal */
export const getCacheRegistrySnapshotForServer = (): QwikCacheRegistrySnapshot => {
  return {
    resources: Array.from(resourceEntries.values(), ({ name, hash, config }) => ({
      name,
      hash,
      policy: config.policy,
      tags: [...(config.tags ?? [])],
      vary: getVarySnapshot(config.vary),
    })),
    components: Array.from(componentEntries.values(), ({ name, ids, config }) => ({
      name,
      ids: [...ids],
      policy: config.policy,
      tags: [...(config.tags ?? [])],
      vary: getVarySnapshot(config.vary),
      registry: getComponentRegistry(config.target),
    })),
  };
};

/** @internal */
export const createServerFunctionCacheKey = (
  qrlHash: string,
  args: readonly unknown[] | undefined,
  namespace = options.namespace,
  varyParts?: readonly unknown[]
): string | null => {
  const keyInput = varyParts?.length
    ? {
        args: args ?? [],
        vary: varyParts,
      }
    : (args ?? []);
  const serializedArgs = stableSerialize(keyInput);
  if (serializedArgs === null) {
    return null;
  }
  return `${namespace}:${qrlHash}:${serializedArgs}`;
};

/** @internal */
export const createComponentHtmlCacheKey = (
  componentId: string,
  props: unknown,
  namespace = componentOptions.namespace,
  varyParts?: readonly unknown[]
): string | null => {
  const keyInput = varyParts?.length
    ? {
        props: props ?? {},
        vary: varyParts,
      }
    : (props ?? {});
  const serializedProps = stableSerialize(keyInput);
  if (serializedProps === null) {
    return null;
  }
  return `${namespace}:${componentId}:${serializedProps}`;
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

  const varyTargets = resourceConfigs.get(qrlHash)?.vary;
  const varyParts = varyTargets?.length
    ? await resolveVaryParts(requestEvent, varyTargets, args ?? [], qrlHash)
    : [];
  if (varyParts === null) {
    stats.keySkips++;
    return run();
  }

  const key = createServerFunctionCacheKey(qrlHash, args, options.namespace, varyParts);
  if (key === null) {
    stats.keySkips++;
    return run();
  }

  const requestCache = options.request ? getRequestCache(requestEvent) : undefined;
  if (requestCache?.has(key)) {
    stats.requestHits++;
    const cached = requestCache.get(key) as T | Promise<T>;
    setAsyncResourceState(requestEvent, {
      key,
      qrlHash,
      status: isPromiseLike(cached) ? 'pending' : 'resolved',
      source: 'request',
      ...(isPromiseLike(cached) ? {} : { value: cached }),
    });
    return cached;
  }

  if (options.memory && memoryCache.has(key)) {
    stats.memoryHits++;
    const value = memoryCache.get(key) as T;
    requestCache?.set(key, value);
    setAsyncResourceState(requestEvent, {
      key,
      qrlHash,
      status: 'resolved',
      source: 'memory',
      value,
    });
    return value;
  }

  if (options.memory && memoryInflight.has(key)) {
    stats.inflightHits++;
    const promise = memoryInflight.get(key) as Promise<T>;
    setAsyncResourceState(requestEvent, {
      key,
      qrlHash,
      status: 'pending',
      source: 'inflight',
    });
    promise.then(
      (value) =>
        setAsyncResourceState(requestEvent, {
          key,
          qrlHash,
          status: 'resolved',
          source: 'inflight',
          value,
        }),
      (error) =>
        setAsyncResourceState(requestEvent, {
          key,
          qrlHash,
          status: 'rejected',
          source: 'inflight',
          error,
        })
    );
    return promise;
  }

  stats.misses++;
  const promise = Promise.resolve().then(run) as Promise<T>;
  requestCache?.set(key, promise);
  setAsyncResourceState(requestEvent, {
    key,
    qrlHash,
    status: 'pending',
    source: 'run',
  });
  if (options.memory) {
    memoryInflight.set(key, promise);
  }

  try {
    const value = await promise;
    if (isAsyncIterable(value)) {
      requestCache?.delete(key);
      deleteAsyncResourceState(requestEvent, key);
      return value;
    }
    requestCache?.set(key, value);
    setAsyncResourceState(requestEvent, {
      key,
      qrlHash,
      status: 'resolved',
      source: 'run',
      value,
    });
    if (options.memory) {
      memoryCache.set(key, value);
    }
    return value;
  } catch (err) {
    requestCache?.delete(key);
    setAsyncResourceState(requestEvent, {
      key,
      qrlHash,
      status: 'rejected',
      source: 'run',
      error: err,
    });
    throw err;
  } finally {
    if (options.memory) {
      memoryInflight.delete(key);
    }
  }
};

/** @internal */
export const runComponentHtmlWithCache = async (
  requestEvent: RequestEventBase | undefined,
  componentId: string,
  props: unknown,
  run: () => ValueOrPromise<string>
): Promise<{ html: string; cacheStatus: 'hit' | 'miss' | 'skip' }> => {
  if (!componentOptions.enabled || !componentTargets.has(componentId)) {
    componentStats.skips++;
    return {
      html: await run(),
      cacheStatus: 'skip',
    };
  }

  const varyTargets = componentConfigs.get(componentId)?.vary;
  const varyParts = varyTargets?.length
    ? await resolveVaryParts(requestEvent, varyTargets, [props ?? {}])
    : [];
  if (varyParts === null) {
    componentStats.keySkips++;
    return {
      html: await run(),
      cacheStatus: 'skip',
    };
  }

  const key = createComponentHtmlCacheKey(
    componentId,
    props,
    componentOptions.namespace,
    varyParts
  );
  if (key === null) {
    componentStats.keySkips++;
    return {
      html: await run(),
      cacheStatus: 'skip',
    };
  }

  const requestCache = componentOptions.request
    ? getComponentRequestCache(requestEvent)
    : undefined;
  if (requestCache?.has(key)) {
    componentStats.requestHits++;
    return {
      html: (await requestCache.get(key)) as string,
      cacheStatus: 'hit',
    };
  }

  if (componentOptions.memory && componentHtmlMemoryCache.has(key)) {
    componentStats.memoryHits++;
    const html = componentHtmlMemoryCache.get(key)!;
    requestCache?.set(key, html);
    return {
      html,
      cacheStatus: 'hit',
    };
  }

  if (componentOptions.memory && componentHtmlMemoryInflight.has(key)) {
    componentStats.inflightHits++;
    return {
      html: await componentHtmlMemoryInflight.get(key)!,
      cacheStatus: 'hit',
    };
  }

  componentStats.misses++;
  const promise = Promise.resolve().then(run);
  requestCache?.set(key, promise);
  if (componentOptions.memory) {
    componentHtmlMemoryInflight.set(key, promise);
  }

  try {
    const html = await promise;
    requestCache?.set(key, html);
    if (componentOptions.memory) {
      componentHtmlMemoryCache.set(key, html);
    }
    return {
      html,
      cacheStatus: 'miss',
    };
  } catch (err) {
    requestCache?.delete(key);
    throw err;
  } finally {
    if (componentOptions.memory) {
      componentHtmlMemoryInflight.delete(key);
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

const getAsyncResourceStateCache = (
  requestEvent: RequestEventBase | undefined,
  create = true
): Map<string, AsyncResourceStateEnvelope> | undefined => {
  const sharedMap = requestEvent?.sharedMap;
  if (!sharedMap) {
    return undefined;
  }
  let stateCache = sharedMap.get(ASYNC_RESOURCE_STATE_KEY) as
    | Map<string, AsyncResourceStateEnvelope>
    | undefined;
  if (!stateCache && create) {
    sharedMap.set(ASYNC_RESOURCE_STATE_KEY, (stateCache = new Map()));
  }
  return stateCache;
};

const setAsyncResourceState = (
  requestEvent: RequestEventBase | undefined,
  envelope: AsyncResourceStateEnvelope
): void => {
  getAsyncResourceStateCache(requestEvent)?.set(envelope.key, envelope);
};

const deleteAsyncResourceState = (
  requestEvent: RequestEventBase | undefined,
  key: string
): void => {
  getAsyncResourceStateCache(requestEvent, false)?.delete(key);
};

const getComponentRequestCache = (
  requestEvent: RequestEventBase | undefined
): Map<string, ComponentHtmlCacheRecord | Promise<ComponentHtmlCacheRecord>> | undefined => {
  const sharedMap = requestEvent?.sharedMap;
  if (!sharedMap) {
    return undefined;
  }
  let requestCache = sharedMap.get(COMPONENT_REQUEST_CACHE_KEY) as
    | Map<string, ComponentHtmlCacheRecord | Promise<ComponentHtmlCacheRecord>>
    | undefined;
  if (!requestCache) {
    sharedMap.set(COMPONENT_REQUEST_CACHE_KEY, (requestCache = new Map()));
  }
  return requestCache;
};

const registerConfiguredComponentTarget = (name: string, config: QwikCacheComponentConfig) => {
  const target = config.target;
  const ids = [name];
  componentTargets.set(name, target);
  componentConfigs.set(name, config);

  const entry = getComponentRegistry(target);
  if (entry) {
    ids.push(entry.id, entry.qrlHash);
    componentTargets.set(entry.id, target);
    componentTargets.set(entry.qrlHash, target);
    componentConfigs.set(entry.id, config);
    componentConfigs.set(entry.qrlHash, config);
  }
  componentEntries.set(name, { name, ids, config });
};

const getComponentRegistry = (
  target: unknown
): QwikCacheRegistryComponentEntry['registry'] | undefined => {
  return target && typeof target === 'function'
    ? (target as ComponentRegistryTarget).__qwik_component_registry__
    : undefined;
};

const getVarySnapshot = (
  varyTargets: readonly ServerFunctionCacheTarget[] | undefined
): QwikCacheRegistryVaryEntry[] => {
  if (!varyTargets?.length) {
    return [];
  }
  return varyTargets.flatMap((target) => {
    const hash = getServerFunctionResourceHash(target);
    if (!hash) {
      return [];
    }
    const resource = Array.from(resourceEntries.values()).find((entry) => entry.hash === hash);
    return [
      {
        hash,
        ...(resource ? { name: resource.name } : {}),
      },
    ];
  });
};

const resolveVaryParts = async (
  requestEvent: RequestEventBase | undefined,
  varyTargets: readonly ServerFunctionCacheTarget[] | undefined,
  args: readonly unknown[],
  skipHash?: string
): Promise<unknown[] | null> => {
  if (!varyTargets?.length) {
    return [];
  }

  const parts: unknown[] = [];
  for (const target of varyTargets) {
    const hash = getServerFunctionResourceHash(target);
    if (!hash || hash === skipHash || typeof target !== 'function') {
      continue;
    }
    try {
      parts.push({
        hash,
        value: await (target as (...args: unknown[]) => ValueOrPromise<unknown>).apply(
          requestEvent,
          Array.from(args)
        ),
      });
    } catch {
      return null;
    }
  }
  return parts;
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

function createComponentStats(): ComponentHtmlCacheStats {
  return {
    misses: 0,
    requestHits: 0,
    memoryHits: 0,
    inflightHits: 0,
    keySkips: 0,
    skips: 0,
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

const isPromiseLike = <T = unknown>(value: unknown): value is Promise<T> => {
  return !!value && typeof value === 'object' && typeof (value as Promise<T>).then === 'function';
};
