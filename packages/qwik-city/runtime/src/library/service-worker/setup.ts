import type { ServiceWorkerBundles, ServiceWorkerLink, ServiceWorkerMessageEvent } from './types';
import { cachedFetch } from './cached-fetch';
import { getCacheToDelete, isBuildRequest } from './utils';
import { awaitingRequests, qBuildCacheName } from './constants';
import { prefetchBundleNames, prefetchLinks } from './prefetch';

export const setupServiceWorkerScope = (
  swScope: ServiceWorkerGlobalScope,
  bundles: ServiceWorkerBundles,
  links: ServiceWorkerLink[],
  libraryBundles: string[]
) => {
  swScope.addEventListener('fetch', (ev) => {
    const request = ev.request;

    if (request.method === 'GET') {
      const url = new URL(request.url);

      if (isBuildRequest(bundles, url.pathname)) {
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

        if (Array.isArray(data.urls)) {
          prefetchBundleNames(bundles, qBuildCache, nativeFetch, baseUrl, data.urls);
        }
        if (Array.isArray(data.links)) {
          prefetchLinks(
            bundles,
            links,
            libraryBundles,
            qBuildCache,
            nativeFetch,
            baseUrl,
            data.links
          );
        }
      }
    }
  });

  swScope.addEventListener('activate', async () => {
    try {
      const qBuildCache = await swScope.caches.open(qBuildCacheName);
      const cachedRequestKeys = await qBuildCache.keys();
      const cachedUrls = cachedRequestKeys.map((r) => r.url);
      const cachedRequestsToDelete = getCacheToDelete(bundles, cachedUrls);
      await Promise.all(cachedRequestsToDelete.map((r) => qBuildCache.delete(r)));
    } catch (e) {
      console.error(e);
    }
  });
};
