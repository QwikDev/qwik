import { describe, expect, it, vi } from 'vitest';
import { _UNINITIALIZED, type SerializationStrategy } from '@qwik.dev/core/internal';
import {
  ensureRouteLoaderSignal,
  getRouteLoaderResponse,
  loadRouteLoader,
  routeLoaderQrl,
  type RouteLoaderState,
} from './route-loaders';
import { ServerError } from '../../middleware/request-handler/server-error';
import type { LoaderInternal } from './types';

describe('search filter early-return logic', () => {
  // Mirrors the captured lastFetch object and condition in createRouteLoaderSignal.
  // Before the fix, only filteredSearch was checked — path changes were silently suppressed.
  it('does not skip fetch when routePath changes even if filtered search is unchanged', () => {
    const lastFetch: {
      filteredSearch?: string;
      routePath?: string;
    } = {};

    const shouldSkipFetch = (routePath: string, filteredSearch: string) => {
      const hasPrevious = lastFetch.filteredSearch !== undefined;
      if (
        hasPrevious &&
        filteredSearch === lastFetch.filteredSearch &&
        routePath === lastFetch.routePath
      ) {
        return true;
      }
      lastFetch.filteredSearch = filteredSearch;
      lastFetch.routePath = routePath;
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
  it('stores an uninitialized resume marker for never loaders', () => {
    const state = {} as RouteLoaderState;
    const routeLoaderCtx = { loaderPaths: {} };
    const neverLoader = createLoader('never-loader', async () => undefined);
    const alwaysLoader = createLoader('always-loader', async () => undefined, 'always');

    ensureRouteLoaderSignal(neverLoader, state, routeLoaderCtx);
    ensureRouteLoaderSignal(alwaysLoader, state, routeLoaderCtx);

    expect(state['never-loader']).toBeDefined();
    expect(state['always-loader']).toBeDefined();
    expect(
      Object.entries(state).filter(([key]) => key.startsWith('__qwik_route_loader_value__'))
    ).toEqual([['__qwik_route_loader_value__never-loader', _UNINITIALIZED]]);
  });

  it('memoizes in-flight loader executions on the request', async () => {
    const requestEv: any = {
      sharedMap: new Map(),
      url: new URL('http://localhost/products/'),
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

  it('rejects blockSSR: false when the experimental flag is not enabled', () => {
    expect(() => routeLoaderQrl(createQrl('bg-loader'), { blockSSR: false })).toThrowError(
      /experimental/
    );
  });
});

describe('getRouteLoaderResponse envelope', () => {
  const requestEv = {} as any;

  it('keeps a fail() result as the loader value, not an error', async () => {
    const qrl = createQrl('fail-loader', async () => ({ failed: true, msg: 'nope' }));

    const response = await getRouteLoaderResponse(qrl, undefined, requestEv);

    expect(response).toEqual({ d: { failed: true, msg: 'nope' } });
    expect(response.e).toBeUndefined();
  });

  it('routes a thrown ServerError to the error channel', async () => {
    const qrl = createQrl('error-loader', async () => {
      throw new ServerError(500, 'boom');
    });

    const response = await getRouteLoaderResponse(qrl, undefined, requestEv);

    expect(response.d).toBeUndefined();
    expect(response.e).toBeInstanceOf(ServerError);
    expect(response.e?.status).toBe(500);
  });
});

function createLoader(
  id: string,
  fn: (thisArg: unknown, ev: any) => unknown,
  serializationStrategy: SerializationStrategy = 'never'
): LoaderInternal {
  return {
    __brand: 'server_loader',
    __id: id,
    __qrl: createQrl(id, fn),
    __validators: undefined,
    __serializationStrategy: serializationStrategy,
    __expires: 0,
    __poll: false,
    __eTag: undefined,
    __cacheKey: undefined,
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
