import { describe } from 'node:test';
import { afterEach, expect, test } from 'vitest';
import { prefetchQueue } from './constants';
import { addBundlesToPrefetchQueue, prefetchBundleNames } from './prefetch';
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

afterEach(() => {
  prefetchQueue.length = 0;
});

const urlPrefix = 'http://localhost';

describe('addBundlesToPrefetchQueue', () => {
  test(`GIVEN 3 modules with 2 imports each
        WHEN attempting to prefetch the first 3 modules
        THEN 9 modules should be added to the prefetching queue`, () => {
    const fakeBaseUrl = new URL(urlPrefix);
    const isHighPriority = false;

    const fakeAppBundles: AppBundle[] = [
      ['a.js', [1, 2]],
      ['b.js', []],
      ['c.js', []],
      ['d.js', [4, 5]],
      ['e.js', []],
      ['f.js', []],
      ['g.js', [7, 8]],
      ['h.js', []],
      ['i.js', []],
    ];

    const bundlesToPrefetch = ['a.js', 'd.js', 'g.js'];

    addBundlesToPrefetchQueue(bundlesToPrefetch, fakeAppBundles, fakeBaseUrl, isHighPriority);

    const expectedResult = [
      'a.js',
      'b.js',
      'c.js',
      'd.js',
      'e.js',
      'f.js',
      'g.js',
      'h.js',
      'i.js',
    ].map((bundle) => `${urlPrefix}/${bundle}`);

    expect(prefetchQueue).toEqual(expectedResult);
  });
  test(`GIVEN 5 modules each importing the following one
        WHEN attempting to prefetch the first module
        THEN all 5 modules should be added to the prefetching queue`, () => {
    const fakeBaseUrl = new URL(urlPrefix);
    const isHighPriority = false;

    const fakeAppBundles: AppBundle[] = [
      ['a.js', [1]],
      ['b.js', [2]],
      ['c.js', [3]],
      ['d.js', [4]],
      ['e.js', []],
    ];

    const bundlesToPrefetch = ['a.js'];

    addBundlesToPrefetchQueue(bundlesToPrefetch, fakeAppBundles, fakeBaseUrl, isHighPriority);

    const expectedResult = ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'].map(
      (bundle) => `${urlPrefix}/${bundle}`
    );

    expect(prefetchQueue).toEqual(expectedResult);
  });
  test(`GIVEN prefetch queue already has 2 modules
        WHEN attempting to prefetch again the second module from the queue but with a high priority
        THEN the second module should be added in front of the first`, () => {
    const fakeBaseUrl = new URL(urlPrefix);
    const isHighPriority = true;

    const fakeAppBundles: AppBundle[] = [
      ['a.js', []],
      ['b.js', []],
    ];

    prefetchQueue.push(`${urlPrefix}/a.js`, `${urlPrefix}/b.js`);

    const bundlesToPrefetch = ['b.js'];

    addBundlesToPrefetchQueue(bundlesToPrefetch, fakeAppBundles, fakeBaseUrl, isHighPriority);

    const expectedResult = ['b.js', 'a.js'].map((bundle) => `${urlPrefix}/${bundle}`);

    expect(prefetchQueue).toEqual(expectedResult);
  });
  test(`GIVEN prefetch queue already has module "a"
        WHEN attempting to prefetch module "b" with a high priority
        THEN module "b" should be added in front of "a"`, () => {
    const fakeBaseUrl = new URL(urlPrefix);
    const isHighPriority = true;

    const fakeAppBundles: AppBundle[] = [
      ['a.js', []],
      ['b.js', []],
    ];

    prefetchQueue.push(`${urlPrefix}/a.js`);

    const bundlesToPrefetch = ['b.js'];

    addBundlesToPrefetchQueue(bundlesToPrefetch, fakeAppBundles, fakeBaseUrl, isHighPriority);

    const expectedResult = ['b.js', 'a.js'].map((bundle) => `${urlPrefix}/${bundle}`);

    expect(prefetchQueue).toEqual(expectedResult);
  });
});

test.skip('getCacheToDelete, delete bundles no longer possible', () => {
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
