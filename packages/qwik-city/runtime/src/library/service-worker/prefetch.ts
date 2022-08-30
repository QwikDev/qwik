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
  const prefetchBundle = (bundleName: string) => {
    try {
      const url = new URL(bundleName, baseUrl).href;
      if (!existingPrefetches.has(url)) {
        existingPrefetches.add(url);
        cachedFetch(qBuildCache, fetch, awaitingRequests, new Request(url));
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
      if (link[0].test(linkPathname)) {
        // prefetch bundles known for this route
        prefetchBundleNames(bundles, qBuildCache, fetch, baseUrl, [...link[1], ...libraryBundles]);
        break;
      }
    }
  }
};
