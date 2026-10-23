import { _serialize } from '@qwik.dev/core/internal';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  renderQwikMiddleware,
  resolveRequestHandlers,
} from '../middleware/request-handler/resolve-request-handlers-core';
import { trimInternalPathname } from '../middleware/request-handler/request-path';
import type { ErrorCodes, RequestEvent } from '../middleware/request-handler/types';
import { runQwikRouter } from '../middleware/request-handler/user-response';
import { loadRoute } from '../runtime/src/routing';
import type { SsgHandlerOptions, SsgWorkerRenderResult, System } from './types';
import { workerRender } from './worker-thread';

const fileEvents: string[] = [];

const deps: Parameters<typeof workerRender>[5] = {
  announceFile: (_pathname, filePath) => {
    fileEvents.push(`announce ${filePath}`);
  },
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
    createLogger: async () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }),
    getOptions: () => ({}) as any,
    ensureDir: async () => {},
    access: async () => false,
    createWriteStream: (filePath) => {
      fileEvents.push(`write ${filePath}`);
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

const throwOnGet = (status: ErrorCodes, message: string) => ({
  default: () => null,
  onGet: (ev: RequestEvent) => {
    throw ev.error(status, message);
  },
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

describe('SSG worker status handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails the route when it renders a 5xx error page', async () => {
    const { sys } = createSystem();
    const result = await renderRoute(sys, createRender(), throwOnGet(503, 'upstream down'));

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('503');
    expect(result.error?.message).toContain('upstream down');
    expect(result.filePath).toBeNull();
  });

  it('still skips a route that renders a 404', async () => {
    const { sys } = createSystem();
    const result = await renderRoute(sys, createRender(), throwOnGet(404, 'missing'));

    expect(result.ok).toBe(false);
    expect(result.error).toBeNull();
    expect(result.filePath).toBeNull();
  });
});

describe('SSG worker output files', () => {
  beforeEach(() => {
    fileEvents.length = 0;
  });

  it('announces each file before writing it', async () => {
    const { sys } = createSystem();
    await renderRoute(sys, createRender());

    expect(fileEvents).toEqual(['announce /out/index.html', 'write /out/index.html']);
  });
});
