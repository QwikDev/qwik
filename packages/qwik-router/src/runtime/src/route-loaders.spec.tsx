/**
 * Spec tests for route loader signal reactivity.
 *
 * These test the core mechanism: useStore + createAsync$ + track() + invalidate(__v). They run in
 * the qwik core test infrastructure since they need ssrRenderToDom/domRender.
 */
// This file should be moved to packages/qwik/src/core/tests/ if it needs the rendering infra.
// For now, test the mechanism at the unit level using the signal test infrastructure.

import { createAsync$, implicit$FirstArg, isDev, type QRL } from '@qwik.dev/core';
import {
  _AsyncSignalImpl as AsyncSignalImpl,
  _Container as Container,
  _createQRL as createQRL,
  _createStore as createStore,
  _delay as delay,
  _getDomContainer as getDomContainer,
  _getSubscriber as getSubscriber,
  _HostElement as HostElement,
  _invoke as invoke,
  _isStore as isStore,
  _newInvokeContext as newInvokeContext,
  _QRLInternal as QRLInternal,
  _retryOnPromise as retryOnPromise,
  _Task as Task,
  _vnode_newVirtual as vnode_newVirtual,
  _vnode_setProp as vnode_setProp,
} from '@qwik.dev/core/internal';
import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModuleRouteLoaders, routeLoaderQrl, setLoaderSignalValue } from './route-loaders';
import type { LoaderInternal, RouteModule } from './types';

describe('route loader store + async signal tracking', () => {
  let container: Container = null!;
  let task: Task | null = null;

  beforeEach(() => {
    const document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
    container = getDomContainer(document.body);
    task = null;
  });

  afterEach(async () => {
    await container.$renderPromise$;
    container = null!;
  });

  it('should track store property and re-compute on change', async () => {
    await withContainer(async () => {
      const ctx = createStore(container, { pageUrl: '/a' }, 1 /* StoreFlags.RECURSIVE */);

      const computeLog: string[] = [];
      const signal = createAsync$(async ({ track }) => {
        const url = track(ctx, 'pageUrl') as string;
        computeLog.push(url);
        return `loaded:${url}`;
      }) as AsyncSignalImpl<string>;

      // Subscribe so effects fire
      await retryOnPromise(() => {
        effect$(() => signal.value);
      });

      expect(signal.value).toBe('loaded:/a');
      expect(computeLog).toEqual(['/a']);

      // Change store property → should trigger re-computation
      ctx.pageUrl = '/b';
      await signal.promise();

      expect(signal.value).toBe('loaded:/b');
      expect(computeLog).toEqual(['/a', '/b']);
    });
  });

  it('should track nested store property', async () => {
    await withContainer(async () => {
      const ctx = createStore(
        container,
        { loaderPaths: { x: '/a/' } as Record<string, string | undefined> },
        1 /* StoreFlags.RECURSIVE */
      );

      const computeLog: string[] = [];
      const signal = createAsync$(async ({ track }) => {
        const path = track(ctx.loaderPaths, 'x') as string | undefined;
        computeLog.push(path || 'none');
        return `path:${path}`;
      }) as AsyncSignalImpl<string>;

      await retryOnPromise(() => {
        effect$(() => signal.value);
      });

      expect(signal.value).toBe('path:/a/');

      // Change nested property
      ctx.loaderPaths.x = '/b/';
      await signal.promise();

      expect(signal.value).toBe('path:/b/');
      expect(computeLog).toEqual(['/a/', '/b/']);
    });
  });

  it('should re-compute after __v info is consumed', async () => {
    await withContainer(async () => {
      const ctx = createStore(container, { pageUrl: '/initial' }, 1 /* StoreFlags.RECURSIVE */);

      const computeLog: string[] = [];
      const signal = createAsync$(async ({ track, info }) => {
        const url = track(ctx, 'pageUrl') as string;
        if (info && typeof info === 'object' && '__v' in (info as object)) {
          computeLog.push(`__v`);
          return (info as { __v: string }).__v;
        }
        computeLog.push(`fetch:${url}`);
        return `fetched:${url}`;
      }) as AsyncSignalImpl<string>;

      await retryOnPromise(() => {
        effect$(() => signal.value);
      });

      expect(signal.value).toBe('fetched:/initial');
      expect(computeLog).toEqual(['fetch:/initial']);

      // Simulate action: invalidate with __v, then force compute
      setLoaderSignalValue(signal, 'action-value');
      await delay(0);

      expect(signal.value).toBe('action-value');
      expect(computeLog).toEqual(['fetch:/initial', '__v']);

      // Now change the store → should trigger re-computation with fetch, NOT stale __v
      ctx.pageUrl = '/after-nav';
      await signal.promise();

      expect(signal.value).toBe('fetched:/after-nav');
      expect(computeLog).toEqual(['fetch:/initial', '__v', 'fetch:/after-nav']);
    });
  });

  it('should track route changes when the first value is injected', async () => {
    await withContainer(async () => {
      const ctx = createStore(container, { pageUrl: '/initial' }, 1 /* StoreFlags.RECURSIVE */);

      const computeLog: string[] = [];
      const signal = createAsync$(async ({ track, info }) => {
        const url = track(ctx, 'pageUrl') as string;
        if (info && typeof info === 'object' && '__v' in (info as object)) {
          computeLog.push('__v');
          return (info as { __v: string }).__v;
        }
        computeLog.push(`fetch:${url}`);
        return `fetched:${url}`;
      }) as AsyncSignalImpl<string>;

      setLoaderSignalValue(signal, 'ssr-value');
      await retryOnPromise(() => {
        effect$(() => signal.value);
      });

      expect(signal.value).toBe('ssr-value');
      expect(computeLog).toEqual(['__v']);

      ctx.pageUrl = '/after-nav';
      await signal.promise();

      expect(signal.value).toBe('fetched:/after-nav');
      expect(computeLog).toEqual(['__v', 'fetch:/after-nav']);
    });
  });

  it('should re-compute for TWO sequential store changes after __v', async () => {
    await withContainer(async () => {
      const ctx = createStore(container, { pageUrl: '/initial' }, 1 /* StoreFlags.RECURSIVE */);

      const computeLog: string[] = [];
      const signal = createAsync$(async ({ track, info }) => {
        const url = track(ctx, 'pageUrl') as string;
        if (info && typeof info === 'object' && '__v' in (info as object)) {
          computeLog.push(`__v`);
          return (info as { __v: string }).__v;
        }
        computeLog.push(`fetch:${url}`);
        return `fetched:${url}`;
      }) as AsyncSignalImpl<string>;

      await retryOnPromise(() => {
        effect$(() => signal.value);
      });

      expect(signal.value).toBe('fetched:/initial');

      // Inject action value
      setLoaderSignalValue(signal, 'action-value');
      await delay(0);
      expect(signal.value).toBe('action-value');

      // First store change
      ctx.pageUrl = '/stuff';
      await signal.promise();
      expect(signal.value).toBe('fetched:/stuff');

      // Second store change — this is what fails in e2e
      ctx.pageUrl = '/welcome';
      await signal.promise();
      expect(signal.value).toBe('fetched:/welcome');

      expect(computeLog).toEqual(['fetch:/initial', '__v', 'fetch:/stuff', 'fetch:/welcome']);
    });
  });

  it('should handle multiple sequential store changes', async () => {
    await withContainer(async () => {
      const ctx = createStore(container, { pageUrl: '/page0' }, 1 /* StoreFlags.RECURSIVE */);

      const signal = createAsync$(async ({ track }) => {
        const url = track(ctx, 'pageUrl') as string;
        return `loaded:${url}`;
      }) as AsyncSignalImpl<string>;

      await retryOnPromise(() => {
        effect$(() => signal.value);
      });

      expect(signal.value).toBe('loaded:/page0');

      ctx.pageUrl = '/page1';
      await signal.promise();
      expect(signal.value).toBe('loaded:/page1');

      ctx.pageUrl = '/page2';
      await signal.promise();
      expect(signal.value).toBe('loaded:/page2');

      ctx.pageUrl = '/page3';
      await signal.promise();
      expect(signal.value).toBe('loaded:/page3');
    });
  });

  it('should verify store is reactive', async () => {
    await withContainer(async () => {
      const ctx = createStore(container, { pageUrl: '/test' }, 1 /* StoreFlags.RECURSIVE */);
      expect(isStore(ctx)).toBe(true);

      const signal = createAsync$(async ({ track }) => {
        return track(ctx, 'pageUrl') as string;
      }) as AsyncSignalImpl<string>;

      await retryOnPromise(() => {
        effect$(() => signal.value);
      });

      expect(signal.value).toBe('/test');
      // After track(), the store should have effects on 'pageUrl'
      // (verified by the fact that changing it triggers re-computation)
      ctx.pageUrl = '/changed';
      await signal.promise();
      expect(signal.value).toBe('/changed');
    });
  });

  ////////////////////////////////////////

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container$ = container;
    return invoke(ctx, fn);
  }

  function effectQrl(fnQrl: QRL<() => void>) {
    const qrl = fnQrl as QRLInternal<() => void>;
    const element: HostElement = vnode_newVirtual();
    task = task || new Task(0 as any, 0, element, fnQrl as QRLInternal, undefined, null);
    vnode_setProp(element, 'q:seq', [task]);
    if (!qrl.resolved) {
      throw qrl.resolve();
    } else {
      const ctx = newInvokeContext();
      ctx.$container$ = container;
      ctx.$effectSubscriber$ = getSubscriber(task, ':' /* EffectProperty.COMPONENT */);
      return invoke(ctx, qrl.getFn(ctx));
    }
  }

  const effect$ = /*#__PURE__*/ implicit$FirstArg(effectQrl);
});

describe('getModuleRouteLoaders', () => {
  const mkLoader = (id: string): LoaderInternal =>
    Object.assign(() => {}, { __brand: 'server_loader', __id: id }) as unknown as LoaderInternal;
  const asModule = (mod: Record<string, unknown>): RouteModule => mod as unknown as RouteModule;

  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('dedups two distinct loaders that share an id, keeping the first', () => {
    const first = mkLoader('shared');
    const second = mkLoader('shared');
    const loaders = getModuleRouteLoaders([asModule({ useFirst: first, useSecond: second })]);
    expect(loaders).toHaveLength(1);
    expect(loaders[0]).toBe(first);
  });

  it('keeps loaders with distinct ids', () => {
    const a = mkLoader('a');
    const b = mkLoader('b');
    const loaders = getModuleRouteLoaders([asModule({ useA: a, useB: b })]);
    expect(loaders).toEqual([a, b]);
  });

  it('returns the same loader object once across modules, with no warning', () => {
    const shared = mkLoader('shared');
    const loaders = getModuleRouteLoaders([
      asModule({ useShared: shared }),
      asModule({ useShared: shared }),
    ]);
    expect(loaders).toHaveLength(1);
    expect(loaders[0]).toBe(shared);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when two distinct loaders collide on an id', () => {
    getModuleRouteLoaders([asModule({ useA: mkLoader('dup'), useB: mkLoader('dup') })]);
    if (isDev) {
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('dup');
    } else {
      expect(warnSpy).not.toHaveBeenCalled();
    }
  });
});

describe('routeLoaderQrl id option', () => {
  const mkQrl = () =>
    createQRL(null, 'useLoader_hashAAA', () => 'data') as unknown as QRL<() => unknown>;

  it('derives __id from the QRL hash by default', () => {
    const loader = routeLoaderQrl(mkQrl() as any) as LoaderInternal;
    expect(loader.__id).toBe('hashAAA');
  });

  it('honors an explicit id option, overriding the QRL hash', () => {
    const loader = routeLoaderQrl(mkQrl() as any, { id: 'explicit-id' }) as LoaderInternal;
    expect(loader.__id).toBe('explicit-id');
  });
});
