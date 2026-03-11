export const MAX_CACHE_SIZE: number =
  typeof globalThis.__SSR_CACHE_SIZE__ === 'number' ? globalThis.__SSR_CACHE_SIZE__ : 50;
const ssrCache = new Map<string, string>();

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
 * @public
 */
export function clearSsrCache(): void {
  ssrCache.clear();
}
