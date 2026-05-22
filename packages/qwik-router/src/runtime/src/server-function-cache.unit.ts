import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEventBase } from './types';
import {
  _getComponentHtmlCacheStatsForTest,
  _getServerFunctionCacheStatsForTest,
  _resetServerFunctionCacheForTest,
  _setServerFunctionCacheOptionsForTest,
  configureCacheForServer,
  createComponentHtmlCacheKey,
  createServerFunctionCacheKey,
  defineCacheConfig,
  getConfiguredComponentTarget,
  getServerFunctionResourceHash,
  runComponentHtmlWithCache,
  runServerFunctionWithCache,
} from './server-function-cache';

const createRequestEvent = (): RequestEventBase => {
  return {
    sharedMap: new Map(),
  } as unknown as RequestEventBase;
};

describe('server function cache', () => {
  afterEach(() => {
    _resetServerFunctionCacheForTest();
  });

  it('is disabled by default', async () => {
    const ev = createRequestEvent();
    const run = vi.fn(() => 'value');

    await expect(runServerFunctionWithCache(ev, 'hash', ['one'], run)).resolves.toBe('value');
    await expect(runServerFunctionWithCache(ev, 'hash', ['one'], run)).resolves.toBe('value');

    expect(run).toHaveBeenCalledTimes(2);
    expect(_getServerFunctionCacheStatsForTest()).toEqual({
      misses: 0,
      requestHits: 0,
      memoryHits: 0,
      inflightHits: 0,
      keySkips: 0,
    });
  });

  it('builds stable keys for plain serializable inputs', () => {
    _setServerFunctionCacheOptionsForTest({ enabled: true });

    expect(createServerFunctionCacheKey('hash', [{ b: 1, a: ['two'] }])).toBe(
      createServerFunctionCacheKey('hash', [{ a: ['two'], b: 1 }])
    );
  });

  it('dedupes in-flight work within one request', async () => {
    _setServerFunctionCacheOptionsForTest({ enabled: true });

    const ev = createRequestEvent();
    let resolve!: (value: string) => void;
    const run = vi.fn(
      () =>
        new Promise<string>((res) => {
          resolve = res;
        })
    );

    const first = runServerFunctionWithCache(ev, 'hash', ['one'], run);
    const second = runServerFunctionWithCache(ev, 'hash', ['one'], run);
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);
    resolve('cached');

    await expect(Promise.all([first, second])).resolves.toEqual(['cached', 'cached']);
    expect(_getServerFunctionCacheStatsForTest()).toMatchObject({
      misses: 1,
      requestHits: 1,
    });
  });

  it('reuses resolved values within one request', async () => {
    _setServerFunctionCacheOptionsForTest({ enabled: true });

    const ev = createRequestEvent();
    const run = vi.fn(() => ({ count: 1 }));

    const first = await runServerFunctionWithCache(ev, 'hash', ['one'], run);
    const second = await runServerFunctionWithCache(ev, 'hash', ['one'], run);

    expect(first).toEqual({ count: 1 });
    expect(second).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
    expect(_getServerFunctionCacheStatsForTest()).toMatchObject({
      misses: 1,
      requestHits: 1,
    });
  });

  it('can reuse resolved values from the optional memory cache', async () => {
    _setServerFunctionCacheOptionsForTest({ enabled: true, memory: true });

    const run = vi.fn(() => ({ count: 1 }));
    const first = await runServerFunctionWithCache(createRequestEvent(), 'hash', ['one'], run);
    const second = await runServerFunctionWithCache(createRequestEvent(), 'hash', ['one'], run);

    expect(second).toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
    expect(_getServerFunctionCacheStatsForTest()).toMatchObject({
      misses: 1,
      memoryHits: 1,
    });
  });

  it('does not cache rejected work', async () => {
    _setServerFunctionCacheOptionsForTest({ enabled: true, memory: true });

    const ev = createRequestEvent();
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValueOnce('ok');

    await expect(runServerFunctionWithCache(ev, 'hash', ['one'], run)).rejects.toThrow('nope');
    await expect(runServerFunctionWithCache(ev, 'hash', ['one'], run)).resolves.toBe('ok');

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('falls back to uncached execution when inputs cannot produce a stable key', async () => {
    _setServerFunctionCacheOptionsForTest({ enabled: true, memory: true });

    const ev = createRequestEvent();
    const run = vi.fn(() => 'value');

    await expect(runServerFunctionWithCache(ev, 'hash', [() => 'x'], run)).resolves.toBe('value');
    await expect(runServerFunctionWithCache(ev, 'hash', [() => 'x'], run)).resolves.toBe('value');

    expect(run).toHaveBeenCalledTimes(2);
    expect(_getServerFunctionCacheStatsForTest()).toMatchObject({
      keySkips: 2,
    });
  });

  it('enables cache only for globally configured server resources', async () => {
    const cachedResource = Object.assign(() => {}, {
      __qwik_server_resource_hash__: 'cached-hash',
      getHash: () => 'wrapper-hash',
    });
    const uncachedRun = vi.fn(() => 'uncached');
    const cachedRun = vi.fn(() => 'cached');

    configureCacheForServer(
      defineCacheConfig({
        defaults: {
          resources: {
            store: 'memory',
            dedupe: true,
          },
        },
        optimize: {
          resources: {
            getProduct: {
              target: cachedResource,
            },
          },
        },
      })
    );

    await expect(
      runServerFunctionWithCache(createRequestEvent(), 'cached-hash', ['one'], cachedRun)
    ).resolves.toBe('cached');
    await expect(
      runServerFunctionWithCache(createRequestEvent(), 'cached-hash', ['one'], cachedRun)
    ).resolves.toBe('cached');

    await expect(
      runServerFunctionWithCache(createRequestEvent(), 'other-hash', ['one'], uncachedRun)
    ).resolves.toBe('uncached');
    await expect(
      runServerFunctionWithCache(createRequestEvent(), 'other-hash', ['one'], uncachedRun)
    ).resolves.toBe('uncached');

    expect(cachedRun).toHaveBeenCalledTimes(1);
    expect(uncachedRun).toHaveBeenCalledTimes(2);
    expect(_getServerFunctionCacheStatsForTest()).toMatchObject({
      memoryHits: 1,
    });
  });

  it('varies configured server resource cache keys by declared server function output', async () => {
    let segment = 'free';
    const getSegment = Object.assign(
      vi.fn(() => ({ segment })),
      {
        __qwik_server_resource_hash__: 'segment-hash',
      }
    );
    const getPricing = Object.assign(() => {}, {
      __qwik_server_resource_hash__: 'pricing-hash',
    });
    const run = vi.fn(() => `price:${segment}`);

    configureCacheForServer(
      defineCacheConfig({
        defaults: {
          resources: {
            store: 'memory',
            dedupe: true,
          },
        },
        optimize: {
          resources: {
            getPricing: {
              target: getPricing,
              vary: [getSegment],
            },
          },
        },
      })
    );

    await expect(
      runServerFunctionWithCache(createRequestEvent(), 'pricing-hash', [{ productId: '1' }], run)
    ).resolves.toBe('price:free');
    await expect(
      runServerFunctionWithCache(createRequestEvent(), 'pricing-hash', [{ productId: '1' }], run)
    ).resolves.toBe('price:free');

    segment = 'pro';

    await expect(
      runServerFunctionWithCache(createRequestEvent(), 'pricing-hash', [{ productId: '1' }], run)
    ).resolves.toBe('price:pro');

    expect(getSegment).toHaveBeenCalledTimes(3);
    expect(run).toHaveBeenCalledTimes(2);
    expect(_getServerFunctionCacheStatsForTest()).toMatchObject({
      misses: 2,
      memoryHits: 1,
    });
  });

  it('uses the server resource hash instead of the wrapper hash for configured server functions', () => {
    const target = Object.assign(() => {}, {
      __qwik_server_resource_hash__: 'resource-hash',
      getHash: () => 'wrapper-hash',
    });

    expect(getServerFunctionResourceHash(target)).toBe('resource-hash');
  });

  it('registers configured components by config name and component registry id', () => {
    const component = Object.assign(() => null, {
      __qwik_component_registry__: {
        id: 'component:product-card-hash',
        qrlHash: 'product-card-hash',
        symbol: 'ProductCard_component_cache_test',
      },
    });

    configureCacheForServer(
      defineCacheConfig({
        defaults: {
          components: {
            store: 'memory',
            dedupe: true,
          },
        },
        optimize: {
          components: {
            ProductCard: {
              target: component,
            },
          },
        },
      })
    );

    expect(getConfiguredComponentTarget('ProductCard')).toBe(component);
    expect(getConfiguredComponentTarget('component:product-card-hash')).toBe(component);
    expect(getConfiguredComponentTarget('product-card-hash')).toBe(component);
  });

  it('builds stable component html cache keys for serializable props', () => {
    expect(createComponentHtmlCacheKey('ProductCard', { b: 1, a: ['two'] })).toBe(
      createComponentHtmlCacheKey('ProductCard', { a: ['two'], b: 1 })
    );
  });

  it('can reuse component html from the optional memory cache', async () => {
    const component = () => null;
    const run = vi.fn(() => '<article>Product</article>');

    configureCacheForServer(
      defineCacheConfig({
        defaults: {
          components: {
            store: 'memory',
            dedupe: true,
          },
        },
        optimize: {
          components: {
            ProductCard: {
              target: component,
            },
          },
        },
      })
    );

    await expect(
      runComponentHtmlWithCache(createRequestEvent(), 'ProductCard', { productId: '1' }, run)
    ).resolves.toEqual({
      html: '<article>Product</article>',
      cacheStatus: 'miss',
    });
    await expect(
      runComponentHtmlWithCache(createRequestEvent(), 'ProductCard', { productId: '1' }, run)
    ).resolves.toEqual({
      html: '<article>Product</article>',
      cacheStatus: 'hit',
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(_getComponentHtmlCacheStatsForTest()).toMatchObject({
      misses: 1,
      memoryHits: 1,
    });
  });

  it('varies configured component html cache keys by declared server function output', async () => {
    let plan = 'free';
    const getSegment = Object.assign(
      vi.fn(() => ({ plan })),
      {
        __qwik_server_resource_hash__: 'segment-hash',
      }
    );
    const component = () => null;
    const run = vi.fn(() => `<article>${plan}</article>`);

    configureCacheForServer(
      defineCacheConfig({
        defaults: {
          components: {
            store: 'memory',
            dedupe: true,
          },
        },
        optimize: {
          components: {
            ProductCard: {
              target: component,
              vary: [getSegment],
            },
          },
        },
      })
    );

    await expect(
      runComponentHtmlWithCache(createRequestEvent(), 'ProductCard', { productId: '1' }, run)
    ).resolves.toEqual({
      html: '<article>free</article>',
      cacheStatus: 'miss',
    });
    await expect(
      runComponentHtmlWithCache(createRequestEvent(), 'ProductCard', { productId: '1' }, run)
    ).resolves.toEqual({
      html: '<article>free</article>',
      cacheStatus: 'hit',
    });

    plan = 'pro';

    await expect(
      runComponentHtmlWithCache(createRequestEvent(), 'ProductCard', { productId: '1' }, run)
    ).resolves.toEqual({
      html: '<article>pro</article>',
      cacheStatus: 'miss',
    });

    expect(getSegment).toHaveBeenCalledTimes(3);
    expect(run).toHaveBeenCalledTimes(2);
    expect(_getComponentHtmlCacheStatsForTest()).toMatchObject({
      misses: 2,
      memoryHits: 1,
    });
  });
});
