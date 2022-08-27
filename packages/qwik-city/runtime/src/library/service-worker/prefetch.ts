import type { Fetch, ServiceWorkerBundles, ServiceWorkerLink } from './types';
import { cachedFetch } from './cached-fetch';
import { existingPrefetches } from './constants';

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
