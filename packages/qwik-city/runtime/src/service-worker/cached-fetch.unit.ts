import { suite as uvuSuite } from 'uvu';
import { equal } from 'uvu/assert';
import { cachedFetch } from './cached-fetch';
import type { AwaitingRequests, Fetch } from './types';

const test = suite();

test('new request, Failed to fetch', async (ctx) => {
  const req = mockRequest('/a.js');
  ctx.addFetchError('/a.js', new Error('Failed to fetch'));

  try {
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      promises.push(cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req));
    }
    equal(ctx.awaitingRequests.size, 1);
    equal(ctx.awaitingRequests.get('/a.js')?.length, 10);
    await Promise.all(promises);
    throw new Error('should have thrown');
  } catch (e: any) {
    equal(e.message, 'Failed to fetch');
    equal(ctx.fetchRequests, 1);
    equal(ctx.awaitingRequests.size, 0);
  }
});

test('new request, Failed to fetch', async (ctx) => {
  const req = mockRequest('/a.js');
  ctx.addFetchError('/a.js', new Error('Failed to fetch'));

  try {
    await cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req);
    throw new Error('should have thrown');
  } catch (e: any) {
    equal(e.message, 'Failed to fetch');
    equal(ctx.fetchRequests, 1);
    equal(ctx.awaitingRequests.size, 0);
  }
});

test('new request, no existing cache, cache ok response', async (ctx) => {
  const req = mockRequest('/a.js');
  ctx.addFetchSuccess(mockResponse('/a.js', 'a'));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < 10; i++) {
    promises.push(cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req));
  }
  equal(ctx.awaitingRequests.size, 1);
  equal(ctx.awaitingRequests.get('/a.js')?.length, 10);
  const responses = await Promise.all(promises);
  equal(responses.length, 10);
  equal(responses[0].body, 'a');
  equal(responses[1].body, 'a');
  equal(ctx.cache.get('/a.js')?.body, 'a');
});

test('new request, no existing cache, do not cache 404 response', async (ctx) => {
  const req = mockRequest('/a.js');
  ctx.addFetchSuccess(mockResponse('/a.js', '404', false));

  const promises: Promise<any>[] = [];
  for (let i = 0; i < 10; i++) {
    promises.push(cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req));
  }
  equal(ctx.awaitingRequests.size, 1);
  equal(ctx.awaitingRequests.get('/a.js')?.length, 10);
  const responses = await Promise.all(promises);
  equal(responses.length, 10);
  equal(responses[0].body, '404');
  equal(responses[1].body, '404');
  equal(ctx.cache.get('/a.js'), undefined);
});

test('new request, no cache', async (ctx) => {
  const req = mockRequest('/abc.js');
  const fetchRes = mockResponse('/abc.js', 'abc');
  ctx.addFetchSuccess(fetchRes);

  const res = await cachedFetch(ctx.cache, ctx.fetch, ctx.awaitingRequests, req);
  equal(res.body, 'abc');
  equal(ctx.fetchRequests, 1);
  equal(ctx.awaitingRequests.size, 0);
});

function suite() {
  const s = uvuSuite<TestContext>('cachedFetch');

  s.before.each((testCtx) => {
    const cacheStore = new Map<string, Response>();
    const cache: any = {
      match: async (url: string) => {
        return cacheStore.get(url);
      },
      put: async (url: string, response: Response) => {
        cacheStore.set(url, response);
      },
      get: (url: string) => cacheStore.get(url),
    };
    testCtx.cache = cache;

    const fetchSuccess = new Map<string, Response>();
    const fetchError = new Map<string, Error>();

    testCtx.addFetchSuccess = (r) => {
      fetchSuccess.set(r.url, r);
    };

    testCtx.addFetchError = (url, e: Error) => {
      fetchError.set(url, e);
    };

    testCtx.fetchRequests = 0;

    testCtx.fetch = async (r: Request) => {
      testCtx.fetchRequests++;
      const e = fetchError.get(r.url);
      if (e) {
        throw e;
      }
      return fetchSuccess.get(r.url)!;
    };

    testCtx.awaitingRequests = new Map();
  });

  return s;
}

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
  fetch: Fetch;
  fetchRequests: number;
  addFetchSuccess: (response: Response) => void;
  addFetchError: (url: string, e: Error) => void;
  awaitingRequests: AwaitingRequests;
}

interface TestCache extends Cache {
  get: (url: string) => Response;
}

test.run();
