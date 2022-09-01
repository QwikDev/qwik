import type { Fetch, ServiceWorkerBundles } from './types';
import { cachedFetch } from './cached-fetch';
import { awaitingRequests, existingPrefetches } from './constants';

export const prefetchBundleNames = (
  appBundles: ServiceWorkerBundles,
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  prefetchAppBundleNames: string[]
) => {
  const prefetchBundle = (prefetchAppBundleName: string) => {
    try {
      const url = new URL(prefetchAppBundleName, baseUrl).href;
      if (appBundles[prefetchAppBundleName] && !existingPrefetches.has(url)) {
        if (existingPrefetches.size > 100) {
          existingPrefetches.clear();
        }
        existingPrefetches.add(url);
        cachedFetch(qBuildCache, fetch, awaitingRequests, new Request(url));
      }
    } catch (e) {
      console.error(e);
    }
  };

  for (const prefetchAppBundleName of prefetchAppBundleNames) {
    prefetchBundle(prefetchAppBundleName);

    const prefetchAppBundleImports = appBundles[prefetchAppBundleName];
    if (Array.isArray(prefetchAppBundleImports)) {
      for (const prefetchAppBundleImport of prefetchAppBundleImports) {
        prefetchBundle(prefetchAppBundleImport);
      }
    }
  }
};
