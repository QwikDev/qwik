import type { ServiceWorkerBundles, ServiceWorkerMessageEvent } from './types';
import { cachedFetch } from './cached-fetch';
import { getCacheToDelete, isAppBuildBundleRequest } from './utils';
import { awaitingRequests, qBuildCacheName } from './constants';
import { prefetchBundleNames } from './prefetch';

export const setupServiceWorkerScope = (
  swScope: ServiceWorkerGlobalScope,
  appBundles: ServiceWorkerBundles
) => {
  swScope.addEventListener('fetch', (ev) => {
    const request = ev.request;

    if (request.method === 'GET') {
      const url = new URL(request.url);

      if (isAppBuildBundleRequest(appBundles, url.pathname)) {
        const nativeFetch = swScope.fetch.bind(swScope);
        ev.respondWith(
          swScope.caches
            .open(qBuildCacheName)
            .then((qrlCache) => cachedFetch(qrlCache, nativeFetch, awaitingRequests, request))
        );
      }
    }
  });

  swScope.addEventListener('message', async ({ data }: ServiceWorkerMessageEvent) => {
    if (data.type === 'qprefetch') {
      if (typeof data.base === 'string') {
        const nativeFetch = swScope.fetch.bind(swScope);
        const qBuildCache = await swScope.caches.open(qBuildCacheName);
        const baseUrl = new URL(data.base, swScope.origin);

        if (Array.isArray(data.bundles)) {
          prefetchBundleNames(appBundles, qBuildCache, nativeFetch, baseUrl, data.bundles);
        }
      }
    }
  });

  swScope.addEventListener('activate', async () => {
    try {
      const qBuildCache = await swScope.caches.open(qBuildCacheName);
      const cachedRequestKeys = await qBuildCache.keys();
      const cachedUrls = cachedRequestKeys.map((r) => r.url);
      const cachedRequestsToDelete = getCacheToDelete(appBundles, cachedUrls);
      await Promise.all(cachedRequestsToDelete.map((r) => qBuildCache.delete(r)));
    } catch (e) {
      console.error(e);
    }
  });
};
