import type { CacheKeyFn, ContentModuleETag, DocumentHeadProps } from '@qwik.dev/router';

export const MAX_CACHE_SIZE: number =
  typeof globalThis.__SSR_CACHE_SIZE__ === 'number' ? globalThis.__SSR_CACHE_SIZE__ : 50;
const ssrCache = new Map<string, string>();

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
 * Resolve the cache key from a CacheKeyFn. Returns null if no cacheKey is defined or the function
 * returns null.
 */
export function resolveCacheKey(
  cacheKeyExport: CacheKeyFn | undefined,
  status: number,
  eTag: string,
  pathname: string
): string | null {
  if (cacheKeyExport === true) {
    return `${status}|${eTag}|${pathname}`;
  }
  if (typeof cacheKeyExport !== 'function') {
    return null;
  }
  return cacheKeyExport(status, eTag, pathname);
}

/** Get cached HTML by key, moving the entry to the end (most recently used). */
export function getCachedHtml(key: string): string | undefined {
  const html = ssrCache.get(key);
  if (html !== undefined) {
    // Move to end (most recently used)
    ssrCache.delete(key);
    ssrCache.set(key, html);
  }
  return html;
}

/** Cache HTML by key, evicting the least recently used entry if at capacity. */
export function setCachedHtml(key: string, html: string): void {
  if (MAX_CACHE_SIZE <= 0) {
    return;
  }
  if (ssrCache.size >= MAX_CACHE_SIZE) {
    // Evict least recently used (first entry in Map iteration order)
    const firstKey = ssrCache.keys().next().value!;
    ssrCache.delete(firstKey);
  }
  ssrCache.set(key, html);
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
  if (cacheKey != null) {
    ssrCache.delete(cacheKey);
  } else {
    ssrCache.clear();
  }
}
