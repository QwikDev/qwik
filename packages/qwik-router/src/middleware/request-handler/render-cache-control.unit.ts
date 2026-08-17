import { describe, expect, it, vi } from 'vitest';
import { requestHandler } from './request-handler';
import { ServerError } from './server-error';
import type { ServerRequestEvent } from './types';

const { routeState } = vi.hoisted(() => ({
  routeState: { module: {} as Record<string, unknown> },
}));

vi.mock('@qwik-router-config', () => ({
  routes: {
    _I: async () => routeState.module,
    'etag-error': { _I: async () => routeState.module },
    'etag-late': { _I: async () => routeState.module },
  },
  serverPlugins: undefined,
  cacheModules: false,
  basePathname: '/',
  fallthrough: false,
}));

function createServerRequestEvent(url = 'http://localhost/') {
  const captured: { status?: number; headers?: Headers; chunks: Uint8Array[] } = { chunks: [] };
  const ev = {
    mode: 'server',
    url: new URL(url),
    locale: undefined,
    platform: {},
    request: new Request(url, { headers: { Accept: 'text/html' } }),
    env: { get: vi.fn() },
    getClientConn: vi.fn(() => ({ ip: '127.0.0.1' })),
    getWritableStream: vi.fn(
      (status: number, headers: Headers, _cookie: unknown, resolve: (v: unknown) => void) => {
        captured.status = status;
        captured.headers = headers;
        resolve(true);
        return new WritableStream<Uint8Array>({
          write(chunk) {
            captured.chunks.push(chunk);
          },
        });
      }
    ),
  } as unknown as ServerRequestEvent;
  return { ev, captured };
}

const createRender = (errorBoundaryCaught: boolean) =>
  vi.fn(async (opts: any) => {
    opts.onBeforeFirstFlush?.({ errorBoundaryCaught });
    await opts.stream.write('<!DOCTYPE html><html q:container="paused"></html>');
    return { flushes: 1, size: 10, isStatic: false, timing: {} };
  });

describe('render cache control', () => {
  it('a boundary error caught before the first flush responds with no-store', async () => {
    routeState.module = { default: () => null };
    const { ev, captured } = createServerRequestEvent();
    const run = await requestHandler(ev, { render: createRender(true) as any });
    await run!.completion;

    expect(captured.status).toBe(200);
    expect(captured.headers?.get('Cache-Control')).toBe('no-store');
    expect(captured.chunks.length).toBeGreaterThan(0);
  });

  it('a healthy render leaves Cache-Control unset', async () => {
    routeState.module = { default: () => null };
    const { ev, captured } = createServerRequestEvent();
    const run = await requestHandler(ev, { render: createRender(false) as any });
    await run!.completion;

    expect(captured.status).toBe(200);
    expect(captured.headers?.get('Cache-Control')).toBeNull();
    expect(captured.chunks.length).toBeGreaterThan(0);
  });

  it('an error document never poisons the SSR etag cache', async () => {
    routeState.module = { default: () => null, routeConfig: { eTag: 'v1', cacheKey: true } };
    const throwingThenErrorDocRender = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new ServerError(500, 'render boom');
      })
      .mockImplementation(async (opts: any) => {
        opts.onBeforeFirstFlush?.({ errorBoundaryCaught: false });
        await opts.stream.write('ERROR DOC');
        return { flushes: 1, size: 9, isStatic: false, timing: {} };
      });
    const first = createServerRequestEvent('http://localhost/etag-error/');
    const run1 = await requestHandler(first.ev, { render: throwingThenErrorDocRender as any });
    await run1!.completion;
    expect(first.captured.status).toBe(500);

    const second = createServerRequestEvent('http://localhost/etag-error/');
    const run2 = await requestHandler(second.ev, { render: throwingThenErrorDocRender as any });
    await run2!.completion;
    expect(second.captured.headers?.get('X-SSR-Cache')).toBeNull();
    expect(second.captured.status).toBe(200);
    expect(throwingThenErrorDocRender).toHaveBeenCalledTimes(3);
  });

  it('a boundary caught after the first flush skips the SSR etag cache', async () => {
    routeState.module = { default: () => null, routeConfig: { eTag: 'v1', cacheKey: true } };
    const lateCatchRender = vi.fn(async (opts: any) => {
      opts.onBeforeFirstFlush?.({ errorBoundaryCaught: false });
      await opts.stream.write('<html>late fallback</html>');
      return { flushes: 2, size: 10, isStatic: false, timing: {}, errorBoundaryCaught: true };
    });
    const first = createServerRequestEvent('http://localhost/etag-late/');
    const run1 = await requestHandler(first.ev, { render: lateCatchRender as any });
    await run1!.completion;
    expect(first.captured.status).toBe(200);

    const second = createServerRequestEvent('http://localhost/etag-late/');
    const run2 = await requestHandler(second.ev, { render: lateCatchRender as any });
    await run2!.completion;
    expect(second.captured.headers?.get('X-SSR-Cache')).toBeNull();
    expect(lateCatchRender).toHaveBeenCalledTimes(2);
  });

  it('an error document responds with no-store', async () => {
    routeState.module = {
      default: () => null,
      onGet: () => {
        throw new ServerError(500, 'boom');
      },
    };
    const { ev, captured } = createServerRequestEvent();
    const run = await requestHandler(ev, { render: createRender(false) as any });
    await run!.completion;

    expect(captured.status).toBe(500);
    expect(captured.headers?.get('Cache-Control')).toBe('no-store');
  });
});
