import { describe, expect, expectTypeOf, it, test, vi } from 'vitest';
import { _UNINITIALIZED, type SerializationStrategy } from '@qwik.dev/core/internal';
import { failReturn } from '../../middleware/request-handler/fail';
import { ServerError } from '../../middleware/request-handler/server-error';
import { RedirectMessage } from '../../middleware/request-handler/redirect-handler';
import {
  ensureRouteLoaderSignal,
  getRouteLoaderData,
  getRouteLoaderResponse,
  loadRouteLoader,
  routeLoader$,
  routeLoaderQrl,
  type RouteLoaderState,
} from './route-loaders';
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
});

describe('loader failures surface as error state', () => {
  // A loader failure (throw error() / failed validator) must surface as the signal's
  // error state (a ServerError) on the server and the client — never as loader.value.
  it('propagates the ServerError thrown by the loader', async () => {
    const ev = makeRequestEv();
    const qrl = createQrl('error-loader', (_thisArg, e) => {
      throw e.error(400, { message: 'Product not found' });
    });

    const promise = getRouteLoaderData(qrl, undefined, ev);
    await expect(promise).rejects.toBeInstanceOf(ServerError);
    await promise.catch((err: ServerError) => {
      expect(err.status).toBe(400);
      expect(err.data).toEqual({ message: 'Product not found' });
      // ServerError derives `.message` from object data's `message` field.
      expect(err.message).toBe('Product not found');
    });
  });

  it('propagates a directly-thrown ServerError', async () => {
    const ev = makeRequestEv();
    const thrown = new ServerError(404, { message: 'gone' });
    const qrl = createQrl('error-loader', () => {
      throw thrown;
    });

    await expect(getRouteLoaderData(qrl, undefined, ev)).rejects.toBe(thrown);
  });

  it('returns the raw value on success', async () => {
    const ev = makeRequestEv();
    const qrl = createQrl('ok-loader', () => ({ result: 'ok' }));

    await expect(getRouteLoaderData(qrl, undefined, ev)).resolves.toEqual({ result: 'ok' });
  });

  it('rejects resolveValue when the resolved loader fails', async () => {
    const requestEv = makeRequestEv();
    const failing = createLoader('failing', (_thisArg, e) => {
      throw e.error(400, { message: 'x' });
    });
    requestEv.resolveValue = (loader: LoaderInternal) => loadRouteLoader(loader, requestEv);

    await expect(loadRouteLoader(failing, requestEv)).rejects.toBeInstanceOf(ServerError);
  });

  it('wraps a returned fail() as an error envelope in getRouteLoaderResponse', async () => {
    const ev = makeRequestEv();
    const qrl = createQrl('fail-resp', (_thisArg, e) => {
      return e.fail(400, { message: 'x' });
    });

    const res = await getRouteLoaderResponse(qrl, undefined, ev);
    expect(res.e).toBeInstanceOf(ServerError);
    expect(res.e?.status).toBe(400);
    expect(res.e?.data).toEqual({ message: 'x' });
    expect(res.d).toBeUndefined();
  });

  it('propagates thrown error() out of getRouteLoaderResponse (abort semantics)', async () => {
    const ev = makeRequestEv();
    const qrl = createQrl('throw-resp', (_thisArg, e) => {
      throw e.error(404, { message: 'gone' });
    });

    await expect(getRouteLoaderResponse(qrl, undefined, ev)).rejects.toBeInstanceOf(ServerError);
  });

  it('returns a data envelope on success in getRouteLoaderResponse', async () => {
    const ev = makeRequestEv();
    const qrl = createQrl('ok-resp', () => ({ result: 'ok' }));

    const res = await getRouteLoaderResponse(qrl, undefined, ev);
    expect(res.d).toEqual({ result: 'ok' });
    expect(res.e).toBeUndefined();
  });

  it('returns a redirect envelope on redirect', async () => {
    const ev = makeRequestEv();
    ev.headers.set('Location', '/login');
    const qrl = createQrl('redir-resp', () => {
      throw new RedirectMessage();
    });

    const res = await getRouteLoaderResponse(qrl, undefined, ev);
    expect(res.r).toBe('/login');
    expect(res.e).toBeUndefined();
    expect(res.d).toBeUndefined();
  });
});

describe('types', () => {
  test('loader.value is the success type (failures surface on .error)', () => () => {
    const useObj = routeLoader$(({ error, query }) => {
      if (query.get('fail') === '1') {
        throw error(400, { message: 'Product not found' });
      }
      return { result: 'ok' };
    });
    expectTypeOf(useObj().value).toEqualTypeOf<{ result: string }>();
  });

  test('primitive loader.value stays a primitive', () => () => {
    const useStr = routeLoader$(({ error, query }) => {
      if (query.get('fail') === '1') {
        throw error(400, { message: 'Product not found' });
      }
      return 'hello';
    });
    expectTypeOf(useStr().value).toEqualTypeOf<string>();
  });

  test('reading value.failed is not valid', () => () => {
    const useObj = routeLoader$(({ error, query }) => {
      if (query.get('fail') === '1') {
        throw error(400, { message: 'Product not found' });
      }
      return { result: 'ok' };
    });
    const value = useObj().value;
    // @ts-expect-error failures surface on loader.error, never loader.value.failed
    value.failed;
  });

  test('loader.error is a typed ServerError for fail() results', () => () => {
    const useObj = routeLoader$((ev) => {
      if (ev.query.get('fail') === '1') {
        return ev.fail(404, { message: 'Product not found' });
      }
      return { result: 'ok' };
    });
    const loader = useObj();
    expectTypeOf(loader.value).toEqualTypeOf<{ result: string }>();
    if (loader.error) {
      expectTypeOf(loader.error.status).toEqualTypeOf<number>();
      expectTypeOf(loader.error.data).toEqualTypeOf<{ message: string }>();
    }
  });

  test('thrown error() aborts the request and never lands on loader.error', () => () => {
    const useObj = routeLoader$(({ error, query }) => {
      if (query.get('fail') === '1') {
        throw error(404, { message: 'Product not found' });
      }
      return { result: 'ok' };
    });
    const loader = useObj();
    // No fail() and no validator: the loader can never produce an inline error state.
    expectTypeOf(loader.error).toEqualTypeOf<undefined>();
  });
});

function makeRequestEv(): any {
  let _status = 200;
  return {
    sharedMap: new Map(),
    headers: new Map<string, string>(),
    url: new URL('http://localhost/products/'),
    status: (s?: number) => {
      if (s !== undefined) {
        _status = s;
      }
      return _status;
    },
    error: (status: number, data: unknown) => {
      _status = status;
      return new ServerError(status, data);
    },
    fail: (status: number, data: Record<string, any>) => failReturn(status, data),
  };
}

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
