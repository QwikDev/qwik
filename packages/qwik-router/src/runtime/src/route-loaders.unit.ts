import { isDev, useComputed$ } from '@qwik.dev/core';
import { createOwner, disposeOwner, runWithOwner } from '@qwik.dev/core/internal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _UNINITIALIZED, type SerializationStrategy } from '@qwik.dev/core/internal';
import {
  abortRouteLoaderNavigation,
  prepareRouteLoaders,
  commitRouteLoaders,
  restoreRouteLoaders,
  getClientRouteLoaders,
  ensureRouteLoaderSignal,
  getModuleRouteLoaders,
  getRouteLoaderResponse,
  isImmutableLoader,
  loadRouteLoader,
  routeLoaderQrl,
  setLoaderSignalValue,
  type RouteLoaderState,
  type RouteLoaderCtx,
} from './route-loaders';
import { loadRoute } from './routing';
import { ServerError } from '../../middleware/request-handler/server-error';
import type { LoaderInternal, RouteModule } from './types';

describe('route loader execution', () => {
  it('rewrite metadata does not retain the departed layout signal', async () => {
    const parent = createLoader('departed-layout', async () => 'parent');
    const target = createLoader('target-page', async () => 'target');
    const layoutModule = { parent } as unknown as RouteModule;
    const targetModule = { target } as unknown as RouteModule;
    const routes = {
      _L: () => layoutModule,
      _R: ['departed-layout'],
      target: { _I: [() => targetModule], _D: ['target-page'] },
      alias: { _G: 'target' },
    };
    const state: RouteLoaderState = {};
    const ctx: RouteLoaderCtx = { loaderPaths: { 'departed-layout': '/' } };
    ensureRouteLoaderSignal(parent, state, ctx);
    vi.spyOn(state['departed-layout'], 'invalidate').mockImplementation(() => {});
    const next = await loadRoute(routes, false, '/alias/');
    prepareRouteLoaders(
      next.$mods$,
      state,
      ctx,
      next.$loaderPaths$,
      new URL('http://test/alias/'),
      new URL('http://test/'),
      1
    );
    commitRouteLoaders(state, ctx, 1);
    expect(
      Object.keys(state).filter((id) => !id.startsWith('__qwik_route_loader_value__'))
    ).toEqual(['target-page']);
  });

  it('refreshes a resumed loader whose module export is still lazy', () => {
    const state: RouteLoaderState = {};
    const ctx: RouteLoaderCtx = { loaderPaths: { shared: '/a/' } };
    const shared = createLoader('shared', async () => 'shared');
    const child = createLoader('child', async () => 'child');
    const signal = ensureRouteLoaderSignal(shared, state, ctx);
    const invalidate = vi.spyOn(signal, 'invalidate').mockImplementation(() => {});

    prepareRouteLoaders(
      [{ child } as unknown as RouteModule],
      state,
      ctx,
      { shared: '/a/', child: '/a/child/' },
      new URL('http://test/a/child/'),
      new URL('http://test/a/'),
      1
    );

    expect(invalidate).toHaveBeenCalledOnce();
    expect(getClientRouteLoaders(ctx).current.requests.get(signal)).toMatchObject({
      active: true,
      pageUrl: 'http://test/a/child/',
    });
    commitRouteLoaders(state, ctx, 1);
    expect(state.shared).toBe(signal);
  });

  it('keeps shared signals and retires departed loaders only on the latest commit', () => {
    const state: RouteLoaderState = {};
    const ctx: RouteLoaderCtx = { loaderPaths: { parent: '/a/', shared: '/' } };
    const parent = createLoader('parent', async () => 'parent');
    const shared = createLoader('shared', async () => 'shared');
    const child = createLoader('child', async () => 'child');
    ensureRouteLoaderSignal(parent, state, ctx);
    ensureRouteLoaderSignal(shared, state, ctx);
    const parentSignal = state.parent;
    const sharedSignal = state.shared;
    const sharedInvalidate = vi.spyOn(sharedSignal, 'invalidate').mockImplementation(() => {});
    const parentInvalidate = vi.spyOn(parentSignal, 'invalidate').mockImplementation(() => {});
    prepareRouteLoaders(
      [{ shared, child } as unknown as RouteModule],
      state,
      ctx,
      { shared: '/', child: '/a/child/' },
      new URL('http://test/a/child/'),
      new URL('http://test/a/'),
      1
    );
    expect(parentInvalidate).not.toHaveBeenCalled();
    expect(sharedInvalidate).toHaveBeenCalledOnce();
    expect(state.parent).toBe(parentSignal);
    expect(state.shared).toBe(sharedSignal);
    commitRouteLoaders(state, ctx, 0);
    expect(state.parent).toBe(parentSignal);
    commitRouteLoaders(state, ctx, 1);
    const client = getClientRouteLoaders(ctx);
    expect([...client.current.requests.keys()]).toEqual([sharedSignal, state.child]);
    expect(client.committed).toBe(client.current);
    expect(state.parent).toBeUndefined();
    expect(Object.keys(state).some((key) => key.endsWith('__parent'))).toBe(false);
    expect(ctx.loaderPaths.parent).toBeUndefined();
    prepareRouteLoaders(
      [{ parent, shared } as unknown as RouteModule],
      state,
      ctx,
      { parent: '/a/', shared: '/' },
      new URL('http://test/a/'),
      new URL('http://test/a/child/'),
      2
    );
    expect(state.parent).not.toBe(parentSignal);
    expect(state.shared).toBe(sharedSignal);
  });

  it('restores the committed route and isolates another router', () => {
    const parent = createLoader('parent', async () => 'parent');
    const child = createLoader('child', async () => 'child');
    const state: RouteLoaderState = {};
    const ctx: RouteLoaderCtx = { loaderPaths: { parent: '/a/' } };
    const other: RouteLoaderState = {};
    const otherCtx: RouteLoaderCtx = { loaderPaths: { parent: '/a/' } };
    ensureRouteLoaderSignal(parent, state, ctx);
    ensureRouteLoaderSignal(parent, other, otherCtx);
    const signal = state.parent;
    vi.spyOn(signal, 'invalidate').mockImplementation(() => {});
    const otherSignal = other.parent;
    prepareRouteLoaders(
      [{ child } as unknown as RouteModule],
      state,
      ctx,
      { child: '/b/' },
      new URL('http://test/b/'),
      new URL('http://test/a/'),
      1
    );
    restoreRouteLoaders(state, ctx, 1);
    expect(state.parent).toBe(signal);
    expect(state.child).toBeUndefined();
    expect(other.parent).toBe(otherSignal);
    expect(ctx.loaderPaths).toEqual({ parent: '/a/' });
    const client = getClientRouteLoaders(ctx);
    expect([...client.current.requests.keys()]).toEqual([signal]);
    expect(client.committed).toBe(client.current);
  });

  it('refreshes immutable inputs and forces actions once across task retries', () => {
    const state: RouteLoaderState = {};
    const ctx: RouteLoaderCtx = { loaderPaths: { immutable: '/a/' } };
    const immutable = routeLoaderQrl(createQrl('immutable'), { cacheControl: 'immutable' });
    ensureRouteLoaderSignal(immutable as LoaderInternal, state, ctx);
    const invalidate = vi.spyOn(state.immutable, 'invalidate').mockImplementation(() => {});
    const mods = [{ immutable } as unknown as RouteModule];
    const url = new URL('http://test/a/');
    prepareRouteLoaders(mods, state, ctx, { immutable: '/a/' }, url, url, 1);
    expect(invalidate).not.toHaveBeenCalled();
    const next = new URL('http://test/b/');
    prepareRouteLoaders(mods, state, ctx, { immutable: '/b/' }, next, url, 2);
    expect(invalidate).toHaveBeenCalledOnce();
    invalidate.mockClear();
    const key = {};
    prepareRouteLoaders(mods, state, ctx, { immutable: '/b/' }, next, next, 3, null, key);
    prepareRouteLoaders(mods, state, ctx, { immutable: '/b/' }, next, next, 3, null, key);
    expect(invalidate).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('keeps search-filtered loaders when only unlisted search params change', () => {
    const state: RouteLoaderState = {};
    const ctx: RouteLoaderCtx = { loaderPaths: { filtered: '/a/' } };
    const filtered = routeLoaderQrl(createQrl('filtered'), { search: ['keep'] });
    ensureRouteLoaderSignal(filtered as LoaderInternal, state, ctx);
    const invalidate = vi.spyOn(state.filtered, 'invalidate').mockImplementation(() => {});
    const mods = [{ filtered } as unknown as RouteModule];
    const first = new URL('http://test/a/?keep=one&noise=first');
    prepareRouteLoaders(mods, state, ctx, { filtered: '/a/' }, first, first, 1);
    invalidate.mockClear();

    const noise = new URL('http://test/a/?keep=one&noise=second');
    prepareRouteLoaders(mods, state, ctx, { filtered: '/a/' }, noise, first, 2);
    expect(invalidate).not.toHaveBeenCalled();

    const keep = new URL('http://test/a/?keep=two&noise=second');
    prepareRouteLoaders(mods, state, ctx, { filtered: '/a/' }, keep, noise, 3);
    expect(invalidate).toHaveBeenCalledOnce();
    invalidate.mockClear();

    const other = new URL('http://test/b/?keep=two&noise=second');
    prepareRouteLoaders(mods, state, ctx, { filtered: '/b/' }, other, keep, 4);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('refetches a kept loader whose pending fetch was aborted by an interrupting navigation', () => {
    const state: RouteLoaderState = {};
    const ctx: RouteLoaderCtx = { loaderPaths: { filtered: '/a/' } };
    const filtered = routeLoaderQrl(createQrl('filtered'), { search: ['keep'] });
    ensureRouteLoaderSignal(filtered as LoaderInternal, state, ctx);
    const signal = state.filtered;
    const invalidate = vi.spyOn(signal, 'invalidate').mockImplementation(() => {});
    vi.spyOn(signal, 'abort').mockImplementation(() => {});
    let isPending = false;
    Object.defineProperty(signal, 'untrackedPending', { get: () => isPending });
    const mods = [{ filtered } as unknown as RouteModule];
    const first = new URL('http://test/a/?keep=one&noise=first');
    prepareRouteLoaders(mods, state, ctx, { filtered: '/a/' }, first, first, 1);
    invalidate.mockClear();

    abortRouteLoaderNavigation(ctx);
    const settled = new URL('http://test/a/?keep=one&noise=second');
    prepareRouteLoaders(mods, state, ctx, { filtered: '/a/' }, settled, first, 2);
    expect(invalidate).not.toHaveBeenCalled();

    isPending = true;
    abortRouteLoaderNavigation(ctx);
    const interrupted = new URL('http://test/a/?keep=one&noise=third');
    prepareRouteLoaders(mods, state, ctx, { filtered: '/a/' }, interrupted, settled, 3);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('leaves departed loaders alone when a navigation is interrupted', () => {
    const state: RouteLoaderState = {};
    const ctx: RouteLoaderCtx = { loaderPaths: { parent: '/a/' } };
    const parent = createLoader('parent', async () => 'parent');
    const child = createLoader('child', async () => 'child');
    ensureRouteLoaderSignal(parent, state, ctx);
    const parentSignal = state.parent;
    const abort = vi.spyOn(parentSignal, 'abort').mockImplementation(() => {});
    const readPending = vi.fn(() => false);
    Object.defineProperty(parentSignal, 'untrackedPending', { get: readPending });
    prepareRouteLoaders(
      [{ child } as unknown as RouteModule],
      state,
      ctx,
      { child: '/a/child/' },
      new URL('http://test/a/child/'),
      new URL('http://test/a/'),
      1
    );
    abort.mockClear();

    abortRouteLoaderNavigation(ctx);

    // Probing a departed loader would start its compute and wake the outgoing page.
    expect(readPending).not.toHaveBeenCalled();
    expect(abort).not.toHaveBeenCalled();
  });

  it('injects a value through the computed signal', async () => {
    const signal = runWithOwner(createOwner(null), () =>
      useComputed$(({ info }) =>
        info && typeof info === 'object' && '__v' in info ? info.__v : 'fetched'
      )
    );

    setLoaderSignalValue(signal, 'injected');
    await signal.promise();

    expect(signal.value).toBe('injected');
  });

  it('stores an uninitialized resume marker for never loaders', () => {
    const state = {} as RouteLoaderState;
    const routeLoaderCtx = { loaderPaths: {} };
    const neverLoader = createLoader('never-loader', async () => undefined);
    const alwaysLoader = createLoader('always-loader', async () => undefined, 'always');
    state['never-loader'] = {} as any;
    state['always-loader'] = {} as any;

    ensureRouteLoaderSignal(neverLoader, state, routeLoaderCtx);
    ensureRouteLoaderSignal(alwaysLoader, state, routeLoaderCtx);

    expect(state['never-loader']).toBeDefined();
    expect(state['always-loader']).toBeDefined();
    expect(
      Object.entries(state).filter(([key]) => key.startsWith('__qwik_route_loader_value__'))
    ).toEqual([['__qwik_route_loader_value__never-loader', _UNINITIALIZED]]);
  });

  it('keeps a loader signal alive after the component that first used it is disposed', async () => {
    // a plugin loader first reached from the footer must survive the footer's row being swapped
    const state = {} as RouteLoaderState;
    const routeLoaderCtx = { loaderPaths: {} };
    const loader = routeLoaderQrl(
      createQrl('shared-loader', ({ info }) => info?.__v ?? 'fetched')
    ) as LoaderInternal;
    const footer = createOwner(null);
    const signal = runWithOwner(footer, () =>
      ensureRouteLoaderSignal(loader, state, routeLoaderCtx)
    );

    // route-wide state is not owned by whichever component reached for it first
    expect((signal as { owner?: unknown }).owner).not.toBe(footer);
    disposeOwner(footer);
    setLoaderSignalValue(signal, 'still here');
    await signal.promise();

    expect(signal.value).toBe('still here');
  });

  it('registers immutable loaders so nav-wide invalidation skips them', () => {
    const state = {} as RouteLoaderState;
    const routeLoaderCtx = { loaderPaths: {} };
    const immutable = routeLoaderQrl(createQrl('immutable-loader'), {
      cacheControl: 'immutable',
    }) as LoaderInternal;
    const normal = routeLoaderQrl(createQrl('normal-loader')) as LoaderInternal;

    runWithOwner(createOwner(null), () => {
      ensureRouteLoaderSignal(immutable, state, routeLoaderCtx);
      ensureRouteLoaderSignal(normal, state, routeLoaderCtx);
    });

    expect(isImmutableLoader(immutable.__id)).toBe(true);
    expect(isImmutableLoader(normal.__id)).toBe(false);
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

  it('stores the cacheControl option', () => {
    const loader = routeLoaderQrl(createQrl('cached-loader'), {
      cacheControl: 'immutable',
    }) as LoaderInternal;

    expect(loader.__cacheControl).toBe('immutable');
  });

  it('rejects blockSSR: false when the experimental flag is not enabled', () => {
    expect(() => routeLoaderQrl(createQrl('bg-loader'), { blockSSR: false })).toThrowError(
      /experimental/
    );
  });
});

describe('getModuleRouteLoaders', () => {
  const createModule = (mod: Record<string, unknown>) => mod as unknown as RouteModule;
  const createLoaderWithId = (id: string) =>
    Object.assign(() => {}, { __brand: 'server_loader', __id: id }) as unknown as LoaderInternal;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('deduplicates loaders by id', () => {
    const first = createLoaderWithId('shared');
    const second = createLoaderWithId('shared');

    expect(getModuleRouteLoaders([createModule({ first, second })])).toEqual([first]);
    if (isDev) {
      expect(warnSpy).toHaveBeenCalledOnce();
    }
  });

  it('does not warn for the same loader exported by multiple modules', () => {
    const shared = createLoaderWithId('shared');

    expect(getModuleRouteLoaders([createModule({ shared }), createModule({ shared })])).toEqual([
      shared,
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
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
  return Object.assign(() => {}, {
    __brand: 'server_loader',
    __id: id,
    __qrl: createQrl(id, fn),
    __validators: undefined,
    __serializationStrategy: serializationStrategy,
    __eTag: undefined,
    __cacheKey: undefined,
    __search: undefined,
  }) as any;
}

// A QRL is invoked as `call(thisArg, ev)`, and a loader gets its context as both.
function createQrl(id: string, fn: (...args: any[]) => unknown = async () => undefined) {
  return {
    call: vi.fn(fn),
    getHash: () => id,
    getSymbol: () => id,
  } as any;
}
