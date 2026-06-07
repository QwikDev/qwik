import type {
  CacheKeyFn,
  ContentModuleETag,
  DocumentHeadProps,
  RequestEvent,
} from '@qwik.dev/router';

export const MAX_CACHE_SIZE: number =
  typeof globalThis.__SSR_CACHE_SIZE__ === 'number' ? globalThis.__SSR_CACHE_SIZE__ : 50;

/** Cached entry shape for both SSR HTML and loader JSON caches. */
export interface CachedEntry {
  /** Normalized, unquoted ETag. */
  eTag: string;
  /** The response body (HTML for SSR, serialized JSON for loaders). */
  body: string;
}

function createLruCache() {
  const cache = new Map<string, CachedEntry>();
  return {
    get(key: string): CachedEntry | undefined {
      const entry = cache.get(key);
      if (entry !== undefined) {
        // Move to end (most recently used)
        cache.delete(key);
        cache.set(key, entry);
      }
      return entry;
    },
    set(key: string, entry: CachedEntry): void {
      if (MAX_CACHE_SIZE <= 0) {
        return;
      }
      if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value!;
        cache.delete(firstKey);
      }
      cache.set(key, entry);
    },
    clear(key?: string): void {
      if (key != null) {
        cache.delete(key);
      } else {
        cache.clear();
      }
    },
  };
}

const ssrCache = createLruCache();
const loaderCache = createLruCache();

/**
 * Resolve an eTag value from a ContentModuleETag (string, function, or undefined). Returns the eTag
 * string or null.
 */
export function resolveETag(
  eTagExport: ContentModuleETag | undefined,
  headProps: DocumentHeadProps
): string | null {
  if (eTagExport === undefined) {
    return null;
  }
  if (typeof eTagExport === 'function') {
    return eTagExport(headProps);
  }
  return eTagExport;
}

/**
 * Resolve a cache key from a CacheKeyFn. Callers pass the default key used when `cacheKey ===
 * true`, so the surface-specific shape (SSR vs loader) is centralized here.
 */
export function resolveCacheKey(
  cacheKeyExport: CacheKeyFn | undefined,
  defaultKey: string,
  requestEv: RequestEvent,
  eTag: string
): string {
  if (cacheKeyExport === true) {
    return defaultKey;
  }
  if (typeof cacheKeyExport !== 'function') {
    return '';
  }
  return cacheKeyExport(requestEv, eTag) || '';
}

/** Build the default SSR cache key. eTag slot is dropped when no eTag was resolved. */
export function defaultSsrCacheKey(status: number, eTag: string, pathname: string): string {
  return eTag ? `${status}|${eTag}|${pathname}` : `${status}|${pathname}`;
}

/** Build the default loader cache key. eTag slot is dropped when no eTag was resolved. */
export function defaultLoaderCacheKey(
  pathname: string,
  filteredSearch: string,
  loaderId: string,
  eTag: string
): string {
  const base = `${pathname}|${filteredSearch}|${loaderId}`;
  return eTag ? `${base}|${eTag}` : base;
}

/** Get a cached SSR entry by key (LRU touch). */
export function getCachedSsr(key: string): CachedEntry | undefined {
  return ssrCache.get(key);
}

/** Cache an SSR entry by key, evicting the least recently used entry if at capacity. */
export function setCachedSsr(key: string, entry: CachedEntry): void {
  ssrCache.set(key, entry);
}

/** Get a cached loader entry by key (LRU touch). */
export function getCachedLoader(key: string): CachedEntry | undefined {
  return loaderCache.get(key);
}

/** Cache a loader entry by key, evicting the least recently used entry if at capacity. */
export function setCachedLoader(key: string, entry: CachedEntry): void {
  loaderCache.set(key, entry);
}

/**
 * Clear the in-memory SSR cache. Call after deployments or data changes.
 *
 * When `cacheKey` is provided, only that single entry is removed; otherwise the entire cache is
 * cleared.
 *
 * @public
 */
export function clearSsrCache(cacheKey?: string): void {
  ssrCache.clear(cacheKey);
}

/**
 * Clear the in-memory loader cache. Call after deployments or data changes.
 *
 * When `cacheKey` is provided, only that single entry is removed; otherwise the entire cache is
 * cleared.
 *
 * @public
 */
export function clearLoaderCache(cacheKey?: string): void {
  loaderCache.clear(cacheKey);
}
