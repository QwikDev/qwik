import { _serialize } from '@qwik.dev/core/internal';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  renderQwikMiddleware,
  resolveRequestHandlers,
} from '../middleware/request-handler/resolve-request-handlers-core';
import { trimInternalPathname } from '../middleware/request-handler/request-path';
import type { RequestEventLoader } from '../middleware/request-handler/types';
import { runQwikRouter } from '../middleware/request-handler/user-response';
import { loadRoute } from '../runtime/src/routing';
import type { SsgHandlerOptions, SsgWorkerRenderResult, System } from './types';
import { workerRender } from './worker-thread';

const deps: Parameters<typeof workerRender>[5] = {
  loadRoute,
  renderQwikMiddleware,
  resolveRequestHandlers,
  trimInternalPathname,
  runQwikRouter,
  serialize: _serialize,
};

function createSystem() {
  const written = new Map<string, string[]>();
  const sys: System = {
    createMainProcess: null,
    createLogger: async () => ({ info: () => {}, error: () => {}, debug: () => {} }),
    getOptions: () => ({}) as any,
    ensureDir: async () => {},
    access: async () => false,
    createWriteStream: (filePath) => {
      const chunks: string[] = [];
      written.set(filePath, chunks);
      return {
        write: (chunk: string | Buffer) => {
          chunks.push(chunk.toString());
        },
        end: (callback?: () => void) => callback?.(),
        on: () => {},
      };
    },
    createTimer: () => () => 0,
    getRouteFilePath: (pathname) =>
      `/out${pathname === '/' ? '' : pathname}/index.html`.replace('//', '/'),
    getLoaderFilePath: (pathname, loaderId) => `/out${pathname}q-data-${loaderId}.json`,
    getEnv: () => undefined,
    platform: {},
  };
  return { sys, written };
}

const createRender = ({ earlyCatch = false, lateCatch = false } = {}) =>
  vi.fn(async (renderOpts: any) => {
    renderOpts.onBeforeFirstFlush?.({ hasCaughtError: earlyCatch });
    await renderOpts.stream.write('<!DOCTYPE html><html q:container="paused">fallback</html>');
    return {
      flushes: 1,
      size: 10,
      isStatic: false,
      timing: {},
      hasCaughtError: earlyCatch || lateCatch,
    };
  });

function renderRoute(sys: System, render: any, routeModule: object = { default: () => null }) {
  const opts: SsgHandlerOptions = {
    outDir: '/out',
    origin: 'https://example.com',
    render,
    qwikRouterConfig: {
      routes: { _I: async () => routeModule },
      serverPlugins: undefined,
      cacheModules: false,
      basePathname: '/',
      fallthrough: false,
    } as any,
  };
  return new Promise<SsgWorkerRenderResult>((resolve, reject) => {
    workerRender(sys, opts, { pathname: '/', params: undefined }, new Set(), resolve, deps).catch(
      reject
    );
  });
}

describe('SSG worker error boundary handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a healthy render writes the page and stays ok', async () => {
    const { sys, written } = createSystem();
    const result = await renderRoute(sys, createRender());

    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
    expect(result.filePath).toBe('/out/index.html');
    expect(written.get('/out/index.html')?.join('')).toContain('q:container');
  });

  it('a boundary caught before the first flush fails the route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sys } = createSystem();
    const result = await renderRoute(sys, createRender({ earlyCatch: true }));

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('Catch');
    expect(result.filePath).toBeNull();
  });

  it('a boundary caught after the first flush fails the route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sys } = createSystem();
    const result = await renderRoute(sys, createRender({ lateCatch: true }));

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('Catch');
    expect(result.filePath).toBeNull();
  });
});

describe('SSG worker background loaders', () => {
  function createBackgroundLoader(id: string, load: (ev: RequestEventLoader) => unknown) {
    const loader: any = () => {};
    loader.__brand = 'server_loader';
    loader.__id = id;
    loader.__qrl = { call: (_: unknown, ev: RequestEventLoader) => load(ev), getHash: () => id };
    loader.__validators = undefined;
    loader.__serializationStrategy = 'never';
    loader.__cacheControl = 'immutable';
    loader.__search = undefined;
    loader.__blockSSR = false;
    return loader;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails the route when a background loader fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sys } = createSystem();
    const useFailing = createBackgroundLoader('failing', () => {
      throw new Error('background loader failed');
    });
    const result = await renderRoute(sys, createRender(), { default: () => null, useFailing });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe('background loader failed');
  });

  it('does not write the page when a background loader redirects', async () => {
    const { sys, written } = createSystem();
    const useRedirect = createBackgroundLoader('redirect', (ev) => {
      throw ev.redirect(302, '/login/');
    });
    const result = await renderRoute(sys, createRender(), { default: () => null, useRedirect });

    expect(result.ok).toBe(false);
    expect(written.size).toBe(0);
  });

  it("writes a slow background loader's data file", async () => {
    const { sys, written } = createSystem();
    const useSlow = createBackgroundLoader(
      'slow',
      () => new Promise((resolve) => setTimeout(resolve, 50, 'late'))
    );
    const result = await renderRoute(sys, createRender(), { default: () => null, useSlow });

    expect(result.ok).toBe(true);
    expect([...written.keys()]).toContain('/out/q-data-slow.json');
  });
});
