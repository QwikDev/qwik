import { _serialize } from '@qwik.dev/core/internal';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  renderQwikMiddleware,
  resolveRequestHandlers,
} from '../middleware/request-handler/resolve-request-handlers-core';
import { trimInternalPathname } from '../middleware/request-handler/request-path';
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
    renderOpts.onBeforeFirstFlush?.({ errorBoundaryCaught: earlyCatch });
    await renderOpts.stream.write('<!DOCTYPE html><html q:container="paused">fallback</html>');
    return {
      flushes: 1,
      size: 10,
      isStatic: false,
      timing: {},
      errorBoundaryCaught: earlyCatch || lateCatch,
    };
  });

function renderRoute(sys: System, render: any) {
  const opts: SsgHandlerOptions = {
    outDir: '/out',
    origin: 'https://example.com',
    render,
    qwikRouterConfig: {
      routes: { _I: async () => ({ default: () => null }) },
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
    expect(result.error?.message).toContain('ErrorBoundary');
    expect(result.filePath).toBeNull();
  });

  it('a boundary caught after the first flush fails the route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sys } = createSystem();
    const result = await renderRoute(sys, createRender({ lateCatch: true }));

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain('ErrorBoundary');
    expect(result.filePath).toBeNull();
  });
});
