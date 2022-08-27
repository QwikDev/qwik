import type { ServiceWorkerBundles, ServiceWorkerLink, ServiceWorkerMessageEvent } from './types';
import { cachedFetch } from './cached-fetch';
import { qBuildCacheName } from './constants';
import { isBuildRequest } from './utils';
import { prefetchBundleNames, prefetchLinks } from './prefetch';

export const setupServiceWorkerScope = (
  swScope: ServiceWorkerGlobalScope,
  buildBundles: ServiceWorkerBundles,
  buildLink: ServiceWorkerLink[],
  buildLibraryBundles: string[]
) => {
  swScope.addEventListener('fetch', (ev) => {
    const request = ev.request;

    if (request.method === 'GET') {
      const url = new URL(request.url);

      if (isBuildRequest(buildBundles, url.pathname)) {
        const nativeFetch = swScope.fetch.bind(swScope);
        ev.respondWith(
          swScope.caches
            .open(qBuildCacheName)
            .then((qrlCache) => cachedFetch(qrlCache, nativeFetch, request))
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
          prefetchBundleNames(buildBundles, qBuildCache, nativeFetch, baseUrl, data.urls);
        }
        if (Array.isArray(data.links)) {
          prefetchLinks(
            buildBundles,
            buildLink,
            buildLibraryBundles,
            qBuildCache,
            nativeFetch,
            baseUrl,
            data.links
          );
        }
      }
    }
  });

  swScope.addEventListener('install', async () => {
    // clean the cache by removing any cached bundles that are no longer possible
    try {
      const bundleNames = Object.keys(buildBundles);
      const qBuildCache = await swScope.caches.open(qBuildCacheName);
      const cachedQBuildRequests = await qBuildCache.keys();
      await Promise.all(
        cachedQBuildRequests
          .filter((r) => {
            const cachedPathname = new URL(r.url).pathname;
            return !bundleNames.some((bundleName) => cachedPathname.endsWith(bundleName));
          })
          .map((deleteRequest) => qBuildCache.delete(deleteRequest))
      );
    } catch (e) {
      console.error(e);
    }
  });
};
