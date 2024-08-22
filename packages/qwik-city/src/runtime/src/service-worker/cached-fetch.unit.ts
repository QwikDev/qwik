/* eslint-disable no-empty-pattern */
import { assert, beforeEach, test } from 'vitest';
import { cachedFetch } from './cached-fetch';
import type { AwaitingRequests, Fetch } from './types';

function mockRequest(url: string): Request {
  return {
    url,
  } as any;
}

function mockResponse(url: string, body: string, ok = true): Response {
  return { url, body, ok, clone: () => ({ body, ok }) } as any;
}

interface TestContext {
  cache: TestCache;
  fetchRequests: number;
  fetchSuccess: Map<string, Response>;
  fetchError: Map<string, Error>;
  fetch: Fetch;
  addFetchSuccess: (response: Response) => void;
  addFetchError: (url: string, e: Error) => void;
  awaitingRequests: AwaitingRequests;
}

interface TestCache extends Cache {
  get: (url: string) => Response | undefined;
}

let ctx: TestContext;

beforeEach(() => {
  const cacheStore = new Map<string, Response>();
  ctx = {
    cache: {
      match: async (url: string) => {
        return cacheStore.get(url);
      },
      put: async (url: string, response: Response) => {
        cacheStore.set(url, response);
      },
      get: (url: string) => cacheStore.get(url),
    } as TestCache,
    fetchRequests: 0,
    fetchSuccess: new Map<string, Response>(),
    fetchError: new Map<string, Error>(),
    fetch: async (r: Request) => {
      ctx.fetchRequests++;
      const e = ctx.fetchError.get(r.url);
      if (e) {
        throw e;
      }
      return ctx.fetchSuccess.get(r.url)!;
    },
    addFetchSuccess: (r) => ctx.fetchSuccess.set(r.url, r),
    addFetchError: (url: string, e: Error) => {
      ctx.fetchError.set(url, e);
    },
    awaitingRequests: new Map(),
  };
});

test('new request, Failed to fetch', async () => {
  const req = mockRequest('/a.js');
  ctx.addFetchError('/a.js', new Error('Failed to fetch'));

  try {
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req));
    }
    assert.deepEqual(ctx.awaitingRequests.size, 1);
    assert.deepEqual(ctx.awaitingRequests.get('/a.js')?.length, 10);
    await Promise.all(promises);
    throw new Error('should have thrown');
  } catch (e: any) {
    assert.deepEqual(e.message, 'Failed to fetch');
    assert.deepEqual(ctx.fetchRequests, 1);
    assert.deepEqual(ctx.awaitingRequests.size, 0);
  }
});

test('new request, Failed to fetch', async () => {
  const req = mockRequest('/a.js');
  ctx.addFetchError('/a.js', new Error('Failed to fetch'));

  try {
    await cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req);
    throw new Error('should have thrown');
  } catch (e: any) {
    assert.deepEqual(e.message, 'Failed to fetch');
    assert.deepEqual(ctx.fetchRequests, 1);
    assert.deepEqual(ctx.awaitingRequests.size, 0);
  }
});

test('new request, no existing cache, cache ok response', async () => {
  const req = mockRequest('/a.js');
  ctx.addFetchSuccess(mockResponse('/a.js', 'a'));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < 10; i++) {
    promises.push(cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req));
  }
  assert.deepEqual(ctx.awaitingRequests.size, 1);
  assert.deepEqual(ctx.awaitingRequests.get('/a.js')?.length, 10);
  const responses = await Promise.all(promises);
  assert.deepEqual(responses.length, 10);
  assert.deepEqual(responses[0].body, 'a');
  assert.deepEqual(responses[1].body, 'a');
  assert.deepEqual(ctx.cache.get('/a.js')?.body as any, 'a');
});

test('new request, no existing cache, do not cache 404 response', async () => {
  const req = mockRequest('/a.js');
  ctx.addFetchSuccess(mockResponse('/a.js', '404', false));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < 10; i++) {
    promises.push(cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req));
  }
  assert.deepEqual(ctx.awaitingRequests.size, 1);
  assert.deepEqual(ctx.awaitingRequests.get('/a.js')?.length, 10);
  const responses = await Promise.all(promises);
  assert.deepEqual(responses.length, 10);
  assert.deepEqual(responses[0].body, '404');
  assert.deepEqual(responses[1].body, '404');
  assert.deepEqual(ctx.cache.get('/a.js'), undefined);
});

test('new request, no cache', async () => {
  const req = mockRequest('/abc.js');
  const fetchRes = mockResponse('/abc.js', 'abc');
  ctx.addFetchSuccess(fetchRes);

  const res = await cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req);
  assert.deepEqual(res.body as any, 'abc');
  assert.deepEqual(ctx.fetchRequests, 1);
  assert.deepEqual(ctx.awaitingRequests.size, 0);
});
