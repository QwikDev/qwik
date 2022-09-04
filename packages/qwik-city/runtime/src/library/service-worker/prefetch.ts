import type { AppBundle, Fetch, LinkBundle } from './types';
import { awaitingRequests, existingPrefetches } from './constants';
import { cachedFetch } from './cached-fetch';
import { getAppBundleByName, getAppBundlesNamesFromIds } from './utils';

export const prefetchBundleNames = (
  appBundles: AppBundle[],
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  prefetchAppBundleNames: (string | null)[] | undefined | null
) => {
  const prefetchAppBundle = (prefetchAppBundleName: string | null) => {
    try {
      const appBundle = getAppBundleByName(appBundles, prefetchAppBundleName);

      if (appBundle && !existingPrefetches.has(prefetchAppBundleName!)) {
        existingPrefetches.add(prefetchAppBundleName!);

        const importedBundleNames = getAppBundlesNamesFromIds(appBundles, appBundle[1]);
        const url = new URL(prefetchAppBundleName!, baseUrl);
        const request = new Request(url);

        cachedFetch(qBuildCache, fetch, awaitingRequests, request);

        importedBundleNames.forEach(prefetchAppBundle);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (Array.isArray(prefetchAppBundleNames)) {
    prefetchAppBundleNames.forEach(prefetchAppBundle);
  }
};

export const prefetchLinkBundles = (
  appBundles: AppBundle[],
  libraryBundleIds: number[],
  linkBundles: LinkBundle[],
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  linkPathnames: string[]
) => {
  try {
    prefetchBundleNames(
      appBundles,
      qBuildCache,
      fetch,
      baseUrl,
      getAppBundlesNamesFromIds(appBundles, libraryBundleIds)
    );
  } catch (e) {
    console.error(e);
  }

  for (const linkPathname of linkPathnames) {
    try {
      for (const linkBundle of linkBundles) {
        const [route, linkBundleIds] = linkBundle;
        console;
        if (route.test(linkPathname)) {
          prefetchBundleNames(
            appBundles,
            qBuildCache,
            fetch,
            baseUrl,
            getAppBundlesNamesFromIds(appBundles, linkBundleIds)
          );
          break;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
};

export const prefetchWaterfall = (
  appBundles: AppBundle[],
  qBuildCache: Cache,
  fetch: Fetch,
  requestedBuildUrl: URL
) => {
  try {
    const segments = requestedBuildUrl.href.split('/');
    const requestedBundleName = segments[segments.length - 1];
    segments[segments.length - 1] = '';
    const baseUrl = new URL(segments.join('/'));

    prefetchBundleNames(appBundles, qBuildCache, fetch, baseUrl, [requestedBundleName]);
  } catch (e) {
    console.error(e);
  }
};
