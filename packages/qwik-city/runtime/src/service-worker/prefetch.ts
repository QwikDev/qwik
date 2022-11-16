import type { AppBundle, Fetch, LinkBundle } from './types';
import { awaitingRequests, existingPrefetchUrls, prefetchQueue } from './constants';
import { cachedFetch } from './cached-fetch';
import { getAppBundleByName, getAppBundlesNamesFromIds } from './utils';

export const prefetchBundleNames = (
  appBundles: AppBundle[],
  qBuildCache: Cache,
  fetch: Fetch,
  baseUrl: URL,
  prefetchAppBundleNames: (string | null)[] | undefined | null,
  highPriority = false
) => {
  const drainQueue = () => {
    while (prefetchQueue.length > 0 && awaitingRequests.size < 6) {
      // do not prefetch more than 6 requests at a time to ensure
      // the browser is able to handle a user request as soon as possible
      const url = prefetchQueue.shift()!;
      const request = new Request(url);
      if (existingPrefetchUrls.has(url!)) {
        // already prefetched this url once before
        // optimization to skip some async work
        drainQueue();
      } else {
        existingPrefetchUrls.add(url!);
        cachedFetch(qBuildCache, fetch, awaitingRequests, request).finally(drainQueue);
      }
    }
  };

  const prefetchAppBundle = (prefetchAppBundleName: string | null) => {
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
        }

        importedBundleNames.forEach(prefetchAppBundle);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (Array.isArray(prefetchAppBundleNames)) {
    prefetchAppBundleNames.forEach(prefetchAppBundle);
  }
  drainQueue();
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

    prefetchBundleNames(appBundles, qBuildCache, fetch, baseUrl, [requestedBundleName], true);
  } catch (e) {
    console.error(e);
  }
};
