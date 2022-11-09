import type { AppBundle, LinkBundle, ServiceWorkerMessageEvent } from './types';
import { awaitingRequests, qBuildCacheName } from './constants';
import { cachedFetch } from './cached-fetch';
import { computeAppSymbols, getCacheToDelete, isAppBundleRequest, resolveSymbols } from './utils';
import { prefetchBundleNames, prefetchLinkBundles, prefetchWaterfall } from './prefetch';

export const setupServiceWorkerScope = (
  swScope: ServiceWorkerGlobalScope,
  appBundles: AppBundle[],
  libraryBundleIds: number[],
  linkBundles: LinkBundle[]
) => {
  const swFetch = swScope.fetch.bind(swScope);
  const appSymbols = computeAppSymbols(appBundles);

  swScope.addEventListener('fetch', (ev) => {
    const request = ev.request;

    if (request.method === 'GET') {
      const url = new URL(request.url);

      if (isAppBundleRequest(appBundles, url.pathname)) {
        ev.respondWith(
          swScope.caches.open(qBuildCacheName).then((qBuildCache) => {
            prefetchWaterfall(appBundles, qBuildCache, swFetch, url);
            return cachedFetch(qBuildCache, swFetch, awaitingRequests, request);
          })
        );
      }
    }
  });

  swScope.addEventListener('message', async ({ data }: ServiceWorkerMessageEvent) => {
    if (data.type === 'qprefetch' && typeof data.base === 'string') {
      const qBuildCache = await swScope.caches.open(qBuildCacheName);
      const baseUrl = new URL(data.base, swScope.origin);

      if (Array.isArray(data.links)) {
        prefetchLinkBundles(
          appBundles,
          libraryBundleIds,
          linkBundles,
          qBuildCache,
          swFetch,
          baseUrl,
          data.links
        );
      }

      if (Array.isArray(data.bundles)) {
        prefetchBundleNames(appBundles, qBuildCache, swFetch, baseUrl, data.bundles);
      }

      if (Array.isArray(data.symbols)) {
        prefetchBundleNames(
          appBundles,
          qBuildCache,
          swFetch,
          baseUrl,
          resolveSymbols(appSymbols, data.symbols)
        );
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
