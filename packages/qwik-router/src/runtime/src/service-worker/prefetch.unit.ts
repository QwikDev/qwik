import { describe } from 'node:test';
import { afterEach, expect, test, vi } from 'vitest';
import { cachedFetch } from './cached-fetch';
import { awaitingRequests, existingPrefetchUrls, prefetchQueue } from './constants';
import { addBundlesToPrefetchQueue, drainQueue } from './prefetch';
import type { AppBundle, Fetch } from './types';

vi.mock('./cached-fetch');

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

afterEach(() => {
  prefetchQueue.length = 0;
  awaitingRequests.clear();
  existingPrefetchUrls.clear();
  vi.restoreAllMocks();
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

describe('drainQueue', () => {
  test(`GIVEN queue with 3 urls which are successfully fetched
        THEN fetch should be called 3 times
        and the requests should be added to the already cached requests`, async () => {
    prefetchQueue.push(`${urlPrefix}/a.js`, `${urlPrefix}/b.js`, `${urlPrefix}/c.js`);

    vi.mocked(cachedFetch).mockResolvedValue(new Response());

    drainQueue(getStubWorkerCache(), createFakeFetch());

    expect(cachedFetch).toHaveBeenCalledTimes(3);
    await vi.waitUntil(() => existingPrefetchUrls.size > 0);

    expect(existingPrefetchUrls.size).toBe(3);
  });

  test(`GIVEN queue with 4 urls which are successfully fetched
        with one repeating url
        THEN fetch should be called 3 times
        and the requests should be added to the already cached requests`, async () => {
    prefetchQueue.push(
      `${urlPrefix}/a.js`,
      `${urlPrefix}/b.js`,
      `${urlPrefix}/c.js`,
      `${urlPrefix}/a.js`
    );

    vi.mocked(cachedFetch).mockResolvedValue(new Response());

    drainQueue(getStubWorkerCache(), createFakeFetch());

    expect(cachedFetch).toHaveBeenCalledTimes(3);
    await vi.waitUntil(() => existingPrefetchUrls.size > 0);

    expect(existingPrefetchUrls.size).toBe(3);
  });

  test(`GIVEN queue with 2 urls, one succeed and the second fails
        THEN fetch should be called 2 times
        and the "already cached requests" set should be set to 1`, async () => {
    prefetchQueue.push(`${urlPrefix}/a.js`, `${urlPrefix}/b.js`);

    let requestCount = 0;

    vi.mocked(cachedFetch).mockImplementation(async (): Promise<Response> => {
      if (requestCount === 1) {
        throw new Error('Failed to fetch');
      }
      requestCount++;
      return new Response();
    });

    drainQueue(getStubWorkerCache(), createFakeFetch());

    expect(cachedFetch).toHaveBeenCalledTimes(2);
    await vi.waitUntil(() => existingPrefetchUrls.size > 0);
    expect(existingPrefetchUrls.size).toBe(1);
  });
});
