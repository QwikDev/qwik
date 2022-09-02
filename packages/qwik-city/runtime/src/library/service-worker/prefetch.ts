import type { Fetch, AppBundles } from './types';
import { cachedFetch } from './cached-fetch';
import { awaitingRequests, existingPrefetches } from './constants';

export const prefetchBundleNames = (
  appBundles: AppBundles,
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  activeDomQKeys: string[] | undefined,
  prefetchAppBundleNames: string[]
) => {
  const prefetchAppBundle = (prefetchAppBundleName: string) => {
    const appBundle = appBundles[prefetchAppBundleName];

    if (appBundle && !existingPrefetches.has(prefetchAppBundleName)) {
      try {
        existingPrefetches.add(prefetchAppBundleName);

        const [importedBundleNames, symbolHashesInBundle] = appBundle;

        const symbolActiveInDom =
          Array.isArray(activeDomQKeys) &&
          activeDomQKeys.some((qKey) => symbolHashesInBundle.includes(qKey));

        if (!symbolActiveInDom) {
          const url = new URL(prefetchAppBundleName, baseUrl).href;
          cachedFetch(qBuildCache, fetch, awaitingRequests, new Request(url));
        }

        importedBundleNames.forEach(prefetchAppBundle);
      } catch (e) {
        console.error(e);
      }
    }
  };

  prefetchAppBundleNames.forEach(prefetchAppBundle);
};
