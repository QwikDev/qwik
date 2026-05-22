import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEventBase } from './types';
import {
  _getServerFunctionCacheStatsForTest,
  _resetServerFunctionCacheForTest,
  _setServerFunctionCacheOptionsForTest,
  configureCacheForServer,
  createServerFunctionCacheKey,
  defineCacheConfig,
  getServerFunctionResourceHash,
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

  it('uses the server resource hash instead of the wrapper hash for configured server functions', () => {
    const target = Object.assign(() => {}, {
      __qwik_server_resource_hash__: 'resource-hash',
      getHash: () => 'wrapper-hash',
    });

    expect(getServerFunctionResourceHash(target)).toBe('resource-hash');
  });
});
