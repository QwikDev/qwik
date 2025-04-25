import type { CacheControl } from './types';

export function createCacheControl(cacheControl: CacheControl) {
  const controls: string[] = [];
  if (cacheControl === 'day') {
    cacheControl = 60 * 60 * 24;
  } else if (cacheControl === 'week') {
    cacheControl = 60 * 60 * 24 * 7;
  } else if (cacheControl === 'month') {
    cacheControl = 60 * 60 * 24 * 30;
  } else if (cacheControl === 'year') {
    cacheControl = 60 * 60 * 24 * 365;
  } else if (cacheControl === 'private') {
    cacheControl = {
      private: true,
      noCache: true,
    };
  } else if (cacheControl === 'immutable') {
    cacheControl = {
      public: true,
      immutable: true,
      maxAge: 60 * 60 * 24 * 365,
    };
  } else if (cacheControl === 'no-cache') {
    cacheControl = {
      noCache: true,
    };
  }

  if (typeof cacheControl === 'number') {
    cacheControl = {
      maxAge: cacheControl,
      sMaxAge: cacheControl,
    };
  }

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
  if (cacheControl.staleIfError) {
    controls.push(`stale-if-error=${cacheControl.staleIfError}`);
  }
  return controls.join(', ');
}
