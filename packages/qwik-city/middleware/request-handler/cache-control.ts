import type { CacheControl } from './types';

export function createCacheControl(cacheControl: CacheControl) {
  const controls: string[] = [];

  if (cacheControl.immutable) {
    controls.push('immutable');
  }
  if (cacheControl.maxAge) {
    controls.push(`max-age=${cacheControl.maxAge}`);
  }
  if (cacheControl.sMaxAge) {
    controls.push(`s-maxage=${cacheControl.sMaxAge}`);
  }
  if (cacheControl.noStore) {
    controls.push('no-store');
  }
  if (cacheControl.noCache) {
    controls.push('no-cache');
  }
  if (cacheControl.private) {
    controls.push('private');
  }
  if (cacheControl.public) {
    controls.push('public');
  }
  if (cacheControl.staleWhileRevalidate) {
    controls.push(`stale-while-revalidate=${cacheControl.staleWhileRevalidate}`);
  }

  return controls.join(', ');
}
