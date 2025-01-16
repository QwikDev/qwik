import { cachedFetch } from './cached-fetch';
import { awaitingRequests, existingPrefetchUrls, prefetchQueue } from './constants';
import type { AppBundle, Fetch, LinkBundle } from './types';
import { getAppBundleByName, getAppBundlesNamesFromIds } from './utils';

export const prefetchBundleNames = (
  appBundles: AppBundle[],
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  prefetchAppBundleNames: (string | null)[] | undefined | null,
  highPriority = false
) => {
  if (Array.isArray(prefetchAppBundleNames)) {
    addBundlesToPrefetchQueue(prefetchAppBundleNames, appBundles, baseUrl, highPriority);
  }
  drainQueue(qBuildCache, fetch);
};

export function addBundlesToPrefetchQueue(
  bundlesToPrefetch: (string | null)[],
  appBundles: AppBundle[],
  baseUrl: URL,
  highPriority: boolean
) {
  for (const prefetchAppBundleName of bundlesToPrefetch) {
    try {
      const appBundle = getAppBundleByName(appBundles, prefetchAppBundleName);

      if (appBundle) {
        const importedBundleNames = getAppBundlesNamesFromIds(appBundles, appBundle[1]);
        const url = new URL(prefetchAppBundleName!, baseUrl).href;
        const queueIndex = prefetchQueue.indexOf(url);

        if (queueIndex > -1) {
          // already in the queue
          if (highPriority) {
            // move to the front of the queue
            prefetchQueue.splice(queueIndex, 1);
            prefetchQueue.unshift(url);
          }
        } else {
          if (highPriority) {
            // add to the front of the queue
            prefetchQueue.unshift(url);
          } else {
            // add to the end of the queue
            prefetchQueue.push(url);
          }
          addBundlesToPrefetchQueue(importedBundleNames, appBundles, baseUrl, highPriority);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }
}

export function drainQueue(qBuildCache: Cache, fetch: Fetch) {
  // do not prefetch more than 6 requests at a time to ensure
  // the browser is able to handle a user request as soon as possible
  while (prefetchQueue.length > 0 && awaitingRequests.size < 6) {
    const url = prefetchQueue.shift()!;

    if (!existingPrefetchUrls.has(url!)) {
      const request = new Request(url);

      existingPrefetchUrls.add(url!);
      cachedFetch(qBuildCache, fetch, awaitingRequests, request)
        .catch(() => {
          existingPrefetchUrls.delete(url!);
        })
        .finally(() => drainQueue(qBuildCache, fetch));
    }
  }
}

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
    const { baseUrl, requestedBundleName } = splitUrlToBaseAndBundle(requestedBuildUrl);

    prefetchBundleNames(appBundles, qBuildCache, fetch, baseUrl, [requestedBundleName], true);
  } catch (e) {
    console.error(e);
  }
};

function splitUrlToBaseAndBundle(fullUrl: URL) {
  const segments = fullUrl.href.split('/');
  const requestedBundleName = segments[segments.length - 1];
  segments[segments.length - 1] = '';
  const baseUrl = new URL(segments.join('/'));

  return {
    baseUrl,
    requestedBundleName,
  };
}
