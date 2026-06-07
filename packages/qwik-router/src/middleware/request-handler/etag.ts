import type {
  CacheKeyFn,
  ContentModuleETag,
  DocumentHeadProps,
  RequestEvent,
} from '@qwik.dev/router';
import { QLoaderId } from './request-path';

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

type DefaultCacheKeyFn = (requestEv: RequestEvent, eTag: string) => string;

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
 * Resolve a cache key from a CacheKeyFn. The default key callback is only called when `cacheKey ===
 * true`.
 */
export function resolveCacheKey(
  cacheKeyExport: CacheKeyFn | undefined,
  defaultKey: DefaultCacheKeyFn,
  requestEv: RequestEvent,
  eTag: string
): string {
  if (cacheKeyExport === true) {
    return defaultKey(requestEv, eTag);
  }
  if (typeof cacheKeyExport !== 'function') {
    return '';
  }
  return cacheKeyExport(requestEv, eTag) || '';
}

/** Build the default SSR cache key. eTag slot is dropped when no eTag was resolved. */
export function defaultSsrCacheKey(requestEv: RequestEvent, eTag: string): string {
  const status = requestEv.status();
  const pathname = requestEv.url.pathname;
  return eTag ? `${status}|${eTag}|${pathname}` : `${status}|${pathname}`;
}

/** Build the default loader cache key. eTag slot is dropped when no eTag was resolved. */
export function defaultLoaderCacheKey(requestEv: RequestEvent, eTag: string): string {
  const loaderId = requestEv.sharedMap.get(QLoaderId) as string;
  const base = `${requestEv.url.pathname}|${requestEv.url.search}|${loaderId}`;
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
