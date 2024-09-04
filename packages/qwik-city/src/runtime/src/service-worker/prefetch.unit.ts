import { test } from 'vitest';
import { prefetchBundleNames } from './prefetch';
import type { AppBundle, Fetch } from './types';

function getStubWorkerCache() {
  return {
    add: (request: RequestInfo | URL) => Promise.resolve(),
    addAll: (requests: RequestInfo[]) => Promise.resolve(),
    delete: (request: RequestInfo | URL, options?: CacheQueryOptions) => Promise.resolve(true),
    keys: (request?: RequestInfo | URL, options?: CacheQueryOptions) => Promise.resolve([]),
    match: (request: RequestInfo | URL, options?: CacheQueryOptions) => Promise.resolve(undefined),
    matchAll: (request?: RequestInfo | URL, options?: CacheQueryOptions) => Promise.resolve([]),
    put: (request: RequestInfo | URL, response: Response) => Promise.resolve(),
  };
}

function createFakeFetch(): Fetch {
  return async function (request: Request) {
    return new Response();
  };
}

/*
 a. Populating the queue
    - Queue all the imports
    - Queue each bundle only once
    - Change priority if already queued
    - skip if already prefetched (existingPrefetchUrls)
  b. Draining the queue
    - 
  1. imports 
*/

test('getCacheToDelete, delete bundles no longer possible', () => {
  const appBundles: AppBundle[] = createLongAppBundels();
  const bundlesToPrefetch = createBundlesToPrefetch();
  const fakeBaseUrl = new URL('');
  const fakeFetch = createFakeFetch();
  const fakeCache = getStubWorkerCache();

  const actualResult = prefetchBundleNames(
    appBundles,
    fakeCache,
    fakeFetch,
    fakeBaseUrl,
    bundlesToPrefetch
  );
});

const createBundlesToPrefetch = () => ['q-BCeDlcZU.js'];

const createLongAppBundels = () =>
  [
    ['../service-worker.js', []],
    ['q--8Iw-f3z.js', [7, 32, 263, 285, 300, 420, 433, 460], ['o0CELjO7sfc']],
    ['q-01Q7cml5.js', [7, 32, 263, 285, 300, 460], ['kvx7djE5ihw']],
  ] as AppBundle[];
