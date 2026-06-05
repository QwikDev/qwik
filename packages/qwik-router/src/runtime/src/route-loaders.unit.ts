import { describe, expect, it, vi } from 'vitest';
import { loadRouteLoader, routeLoaderQrl } from './route-loaders';
import type { LoaderInternal } from './types';

describe('search filter early-return logic', () => {
  // Mirrors the closure variables and condition in createRouteLoaderSignal.
  // Before the fix, only filteredSearch was checked — path changes were silently suppressed.
  it('does not skip fetch when routePath changes even if filtered search is unchanged', () => {
    let lastFilteredSearch: string | undefined;
    let lastRoutePath: string | undefined;

    const shouldSkipFetch = (routePath: string, filteredSearch: string) => {
      const hasPrevious = lastFilteredSearch !== undefined;
      if (hasPrevious && filteredSearch === lastFilteredSearch && routePath === lastRoutePath) {
        return true;
      }
      lastFilteredSearch = filteredSearch;
      lastRoutePath = routePath;
      return false;
    };

    // First call — no previous value, always fetches
    expect(shouldSkipFetch('/a', 'page=1')).toBe(false);
    // Same path + same search: skip is correct
    expect(shouldSkipFetch('/a', 'page=1')).toBe(true);
    // Different path, same filtered search: must NOT skip (was the bug)
    expect(shouldSkipFetch('/b', 'page=1')).toBe(false);
    // Same path + same search again: skip is correct
    expect(shouldSkipFetch('/b', 'page=1')).toBe(true);
    // Same path, different search: fetch
    expect(shouldSkipFetch('/b', 'page=2')).toBe(false);
  });
});

describe('route loader execution', () => {
  it('memoizes in-flight loader executions on the request', async () => {
    const requestEv: any = {
      sharedMap: new Map(),
    };

    const parentLoader = createLoader('parent', async () => 'parent-value');
    const childLoader = createLoader('child', async (_thisArg, ev) => {
      const value = await ev.resolveValue(parentLoader);
      return `child:${value}`;
    });

    requestEv.resolveValue = (loader: LoaderInternal) => loadRouteLoader(loader, requestEv);

    await expect(
      Promise.all([
        loadRouteLoader(parentLoader, requestEv),
        loadRouteLoader(childLoader, requestEv),
      ])
    ).resolves.toEqual(['parent-value', 'child:parent-value']);
    expect(parentLoader.__qrl.call).toHaveBeenCalledOnce();
  });

  it('stores loader expires values in milliseconds', () => {
    const loader = routeLoaderQrl(createQrl('timed-loader'), { expires: 60_000 }) as LoaderInternal;

    expect(loader.__expires).toBe(60_000);
  });
});

function createLoader(id: string, fn: (thisArg: unknown, ev: any) => unknown): LoaderInternal {
  return {
    __brand: 'server_loader',
    __id: id,
    __qrl: createQrl(id, fn),
    __validators: undefined,
    __serializationStrategy: 'never',
    __expires: 0,
    __poll: false,
    __eTag: undefined,
    __search: undefined,
    __allowStale: true,
  } as any;
}

function createQrl(id: string, fn: (thisArg: unknown, ev: any) => unknown = async () => undefined) {
  return {
    call: vi.fn(fn),
    getHash: () => id,
    getSymbol: () => id,
  } as any;
}
