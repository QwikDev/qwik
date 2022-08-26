import type { ServiceWorkerBundles, ServiceWorkerMessageEvent, ServiceWorkerLink } from './types';

const qBuildCacheName = 'QwikBuild';

export const activeRequests = new Map<string, Promise<Response>>();
export const existingPrefetches = new Set<string>();

export const cachedFetch = (cache: Cache, fetch: Fetch, request: Request) => {
  const url = request.url;

  // possible multiple requests come in for the same url
  let activeRequest = activeRequests.get(url);

  if (!activeRequest) {
    // if there's already an active request (async cache lookup and async network fetch)
    // then use the active request before starting a new one

    let resolve: ((rsp: Response) => void) | null;
    activeRequest = new Promise<Response>((activeResolve) => (resolve = activeResolve));

    // set this url has an active request to prevent double network requests
    activeRequests.set(url, activeRequest);

    cache
      .match(url)
      .then((cachedResponse) => {
        if (useCache(request, cachedResponse)) {
          // cached response found and user did not specifically send
          // a request header to NOT use the cache (wasn't a hard refresh)
          resolve!(cachedResponse!.clone());
        } else {
          // no cached response found or user didn't want to use the cache
          // do a full network request
          return fetch(request).then((networkResponse) => {
            return cache.put(url, networkResponse.clone()).then(() => {
              resolve!(networkResponse.clone());
              existingPrefetches.add(url);
            });
          });
        }
      })
      .catch(() => {
        // network error, probably offline
        return cache.match(url).then((cachedResponse) => {
          if (cachedResponse) {
            // luckily we have a cached version, let's use it instead of an offline message
            resolve!(cachedResponse.clone());
          } else {
            // darn, we've got no connectivity and no cached response
            // respond with a 503 offline message
            resolve!(
              new Response('Offline', {
                status: 503,
                headers: {
                  'Content-Type': 'text/plain',
                },
              })
            );
          }
        });
      })
      .finally(() => {
        // promise resolved (or errored), remove from active request
        activeRequests.delete(url);
      });
  }

  return activeRequest;
};

export const prefetchBundleNames = (
  buildBundles: ServiceWorkerBundles,
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  bundleNames: string[]
) => {
  const fetches: Promise<Response>[] = [];

  const prefetchBundle = (bundleName: string) => {
    try {
      const url = new URL(bundleName, baseUrl).href;
      if (!existingPrefetches.has(url)) {
        existingPrefetches.add(url);
        fetches.push(cachedFetch(qBuildCache, fetch, new Request(url)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  for (const bundleName of bundleNames) {
    prefetchBundle(bundleName);
    if (buildBundles[bundleName]) {
      buildBundles[bundleName].forEach(prefetchBundle);
    }
  }

  return Promise.all(fetches);
};

export const prefetchLinks = (
  buildBundles: ServiceWorkerBundles,
  buildLinks: ServiceWorkerLink[],
  buildLibraryBundles: string[],
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  linkPathnames: string[]
) => {
  for (const linkPathname of linkPathnames) {
    for (const link of buildLinks) {
      const pattern = link[0];
      if (pattern.test(linkPathname)) {
        const bundleNames = [...link[1], ...buildLibraryBundles];
        return prefetchBundleNames(buildBundles, qBuildCache, fetch, baseUrl, bundleNames);
      }
    }
  }
};

export const useCache = (request: Request, response: Response | undefined) => {
  return response && !hasNoCacheHeader(request) && !hasNoCacheHeader(response);
};

const hasNoCacheHeader = (r: { headers: Headers }) =>
  (r.headers.get('Cache-Control') || '').includes('no-cache');

export const isBuildRequest = (buildBundles: ServiceWorkerBundles, requestPathname: string) => {
  for (const bundleName in buildBundles) {
    if (requestPathname.endsWith(bundleName)) {
      return true;
    }
  }
  return false;
};

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

/**
 * @alpha
 */
export const setupServiceWorker = () => {
  if (typeof self !== 'undefined' && typeof bundles !== 'undefined') {
    setupServiceWorkerScope(self as any, bundles, links, libraryBundles);
  }
};

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

declare const bundles: ServiceWorkerBundles;
declare const links: ServiceWorkerLink[];
declare const libraryBundles: string[];
