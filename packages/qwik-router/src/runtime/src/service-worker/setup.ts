import { cachedFetch } from './cached-fetch';
import { awaitingRequests, qBuildCacheName } from './constants';
import { prefetchBundleNames, prefetchLinkBundles, prefetchWaterfall } from './prefetch';
import type { AppBundle, LinkBundle, ServiceWorkerMessageEvent } from './types';
import { computeAppSymbols, getCacheToDelete, isAppBundleRequest, resolveSymbols } from './utils';

export const setupServiceWorkerScope = (
  swScope: ServiceWorkerGlobalScope,
  appBundles: AppBundle[],
  libraryBundleIds: number[],
  linkBundles: LinkBundle[]
) => {
  const swFetch = swScope.fetch.bind(swScope);
  const appSymbols = computeAppSymbols(appBundles);

  swScope.addEventListener('activate', (event) => {
    (async () => {
      try {
        // Delete any other caches that are not the current SW cache name
        event.waitUntil(
          swScope.caches.keys().then((keys) =>
            Promise.all(
              keys.map((key) => {
                if (key !== qBuildCacheName) {
                  return caches.delete(key);
                }
              })
            )
          )
        );

        // Delete old bundles
        const qBuildCache = await swScope.caches.open(qBuildCacheName);
        const cachedRequestKeys = await qBuildCache.keys();
        const cachedUrls = cachedRequestKeys.map((r) => r.url);
        const cachedRequestsToDelete = getCacheToDelete(appBundles, cachedUrls);
        await Promise.all(cachedRequestsToDelete.map((r) => qBuildCache.delete(r)));
      } catch (e) {
        console.error(e);
      }
    })();
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

  swScope.addEventListener('fetch', (event: FetchEvent) => {
    const request = event.request;

    if (request.method === 'GET') {
      const url = new URL(request.url);

      if (isAppBundleRequest(appBundles, url.pathname)) {
        event.respondWith(
          swScope.caches.open(qBuildCacheName).then((qBuildCache) => {
            prefetchWaterfall(appBundles, qBuildCache, swFetch, url);
            return cachedFetch(qBuildCache, swFetch, awaitingRequests, request);
          })
        );
      }
    }
  });
};

declare const self: ServiceWorkerGlobalScope;
