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
import { RedirectMessage } from '../../middleware/request-handler/redirect-handler';
import type { DataValidator, LoaderInternal } from './types';

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
});

describe('getRouteLoaderResponse error channel', () => {
  const createRequestEv = () => {
    let currentStatus = 200;
    const headers = new Headers();
    return {
      sharedMap: new Map(),
      headers,
      status: vi.fn((statusCode?: number) => {
        if (typeof statusCode === 'number') {
          currentStatus = statusCode;
          return statusCode;
        }
        return currentStatus;
      }),
      fail: vi.fn((statusCode: number, data: Record<string, unknown>) => {
        currentStatus = statusCode;
        return { failed: true, ...data };
      }),
      error: vi.fn((statusCode: number, data: unknown) => {
        currentStatus = statusCode;
        return new ServerError(statusCode, data);
      }),
    } as any;
  };

  it('returned fail() lands on .value (d) only', async () => {
    const requestEv = createRequestEv();
    const qrl = { call: vi.fn((ev: any) => ev.fail(400, { msg: 'bad' })) } as any;

    const response = await getRouteLoaderResponse(qrl, undefined, requestEv);

    expect(response.d).toMatchObject({ failed: true, msg: 'bad' });
    expect(response.e).toBeUndefined();
  });

  it('returned error() lands on .error (e) only', async () => {
    const requestEv = createRequestEv();
    const qrl = { call: vi.fn((ev: any) => ev.error(403, { reason: 'nope' })) } as any;

    const response = await getRouteLoaderResponse(qrl, undefined, requestEv);

    expect(response.d).toBeUndefined();
    expect(response.e).toBeInstanceOf(ServerError);
    expect(response.e!.status).toBe(403);
    expect(response.e!.data).toEqual({ reason: 'nope' });
  });

  it('thrown error() rejects (aborts) instead of landing on a channel', async () => {
    const requestEv = createRequestEv();
    const qrl = {
      call: vi.fn(() => {
        throw new ServerError(500, 'boom');
      }),
    } as any;

    await expect(getRouteLoaderResponse(qrl, undefined, requestEv)).rejects.toBeInstanceOf(
      ServerError
    );
  });

  it('thrown redirect() becomes a redirect (r) envelope', async () => {
    const requestEv = createRequestEv();
    requestEv.headers.set('Location', '/login');
    const qrl = {
      call: vi.fn(() => {
        throw new RedirectMessage();
      }),
    } as any;

    const response = await getRouteLoaderResponse(qrl, undefined, requestEv);

    expect(response.r).toBe('/login');
  });

  it('validator failure populates BOTH .value (d) and .error (e)', async () => {
    const requestEv = createRequestEv();
    const validator: DataValidator = {
      validate: vi.fn(async () => ({
        success: false,
        status: 422,
        error: { formErrors: ['too short'], fieldErrors: { name: 'required' } },
      })),
    };
    const qrl = { call: vi.fn(() => ({ ok: true })) } as any;

    const response = await getRouteLoaderResponse(qrl, [validator], requestEv);

    expect(response.d).toMatchObject({ failed: true, fieldErrors: { name: 'required' } });
    expect(response.e).toBeInstanceOf(ServerError);
    expect(response.e!.status).toBe(422);
    expect(qrl.call).not.toHaveBeenCalled();
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
