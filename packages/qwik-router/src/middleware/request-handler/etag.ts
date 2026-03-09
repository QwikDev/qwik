import type {
  CacheKeyFn,
  ContentModuleETag,
  DocumentHeadProps,
  PageModule,
} from '../../runtime/src/types';

const MAX_CACHE_SIZE = 50;
const ssrCache = new Map<string, string>();

/**
 * Resolve the eTag from a leaf (page) module. Returns the eTag string or null if no eTag is defined
 * or the function returns null.
 */
export function resolveETag(
  leafModule: PageModule | undefined,
  headProps: DocumentHeadProps
): string | null {
  const eTagExport = leafModule?.eTag as ContentModuleETag | undefined;
  if (eTagExport === undefined) {
    return null;
  }
  if (typeof eTagExport === 'function') {
    return eTagExport(headProps);
  }
  return eTagExport;
}

/**
 * Resolve the cache key from a leaf (page) module's cacheKey export. Returns null if no cacheKey is
 * exported or the function returns null.
 */
export function resolveCacheKey(
  leafModule: PageModule | undefined,
  status: number,
  eTag: string,
  pathname: string
): string | null {
  const cacheKeyExport = leafModule?.cacheKey as CacheKeyFn | undefined;
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
 * @public
 */
export function clearSsrCache(): void {
  ssrCache.clear();
}
