import type { Fetch, ServiceWorkerBundles, ServiceWorkerLink } from './types';
import { cachedFetch } from './cached-fetch';
import { awaitingRequests, existingPrefetches } from './constants';

export const prefetchBundleNames = (
  bundles: ServiceWorkerBundles,
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  prefetchBundles: string[]
) => {
  const fetches: Promise<Response>[] = [];

  const prefetchBundle = (bundleName: string) => {
    try {
      const url = new URL(bundleName, baseUrl).href;
      if (!existingPrefetches.has(url)) {
        existingPrefetches.add(url);
        fetches.push(cachedFetch(qBuildCache, fetch, awaitingRequests, new Request(url)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  for (const prefetchBundleName of prefetchBundles) {
    prefetchBundle(prefetchBundleName);
    if (bundles[prefetchBundleName]) {
      bundles[prefetchBundleName].forEach(prefetchBundle);
    }
  }

  return Promise.all(fetches);
};

export const prefetchLinks = (
  bundles: ServiceWorkerBundles,
  links: ServiceWorkerLink[],
  libraryBundles: string[],
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  prefetchLinkPathnames: string[]
) => {
  for (const linkPathname of prefetchLinkPathnames) {
    for (const link of links) {
      const pattern = link[0];
      if (pattern.test(linkPathname)) {
        const prefetchBundles = [...link[1], ...libraryBundles];
        return prefetchBundleNames(bundles, qBuildCache, fetch, baseUrl, prefetchBundles);
      }
    }
  }
};
