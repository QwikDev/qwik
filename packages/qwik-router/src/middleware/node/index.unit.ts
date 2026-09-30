import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { QwikRouterNodeRequestOptions } from '.';
import { staticPaths } from '../request-handler/static-paths';

const { mockRequestHandler, mockFromNodeHttp, mockComputeOrigin, mockGetUrl } = vi.hoisted(() => ({
  mockRequestHandler: vi.fn(),
  mockFromNodeHttp: vi.fn(),
  mockComputeOrigin: vi.fn(() => 'http://localhost:3301'),
  mockGetUrl: vi.fn((req: { url?: string }, origin: string) => new URL(req.url || '/', origin)),
}));

vi.mock('@qwik.dev/core', () => ({
  isDev: false,
}));

vi.mock('@qwik.dev/core/server', () => ({
  setServerPlatform: vi.fn(),
}));

vi.mock('@qwik.dev/router/middleware/request-handler', async () => ({
  isStaticPath: (await import('../request-handler/static-paths')).isStaticPath,
  requestHandler: mockRequestHandler,
}));

vi.mock('./http', () => ({
  computeOrigin: mockComputeOrigin,
  fromNodeHttp: mockFromNodeHttp,
  getUrl: mockGetUrl,
}));

import { createQwikRouter } from './index';

const createNodeOptions = (): QwikRouterNodeRequestOptions => ({
  render: vi.fn() as any,
});

describe('createQwikRouter().router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve three-argument middleware arity for Express', () => {
    const middleware = createQwikRouter(createNodeOptions());

    expect(middleware.router).toHaveLength(3);
  });

  it('should not forward handled completion errors after headers are sent', async () => {
    const requestEv = {
      headersSent: true,
    };
    mockFromNodeHttp.mockResolvedValue({
      platform: {},
    });
    mockRequestHandler.mockResolvedValue({
      completion: Promise.resolve(new Error('already handled')),
      requestEv,
    });

    const next = vi.fn();
    const middleware = createQwikRouter(createNodeOptions());

    await middleware.router({ url: '/', headers: {} } as any, {} as any, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('should forward completion errors when headers are not sent', async () => {
    const error = new Error('unhandled');
    mockFromNodeHttp.mockResolvedValue({
      platform: {},
    });
    mockRequestHandler.mockResolvedValue({
      completion: Promise.resolve(error),
      requestEv: {
        headersSent: false,
      },
    });

    const next = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const middleware = createQwikRouter(createNodeOptions());

    await middleware.router({ url: '/', headers: {} } as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(error);
    consoleError.mockRestore();
  });

  it('should preserve a stricter host body limit', async () => {
    const opts = createNodeOptions();
    opts.requestBodyLimit = 4096;
    mockFromNodeHttp.mockResolvedValue({ platform: {} });
    mockRequestHandler.mockResolvedValue(undefined);
    const middleware = createQwikRouter(opts);

    await (middleware.router as any)({ url: '/', headers: {} }, {}, vi.fn(), { bodyLimit: 1024 });

    expect(mockFromNodeHttp).toHaveBeenCalledWith(
      expect.any(URL),
      expect.any(Object),
      expect.any(Object),
      'server',
      undefined,
      1024
    );
  });
});

describe('createQwikRouter().staticFile', () => {
  let staticRoot: string;
  let originalStaticPaths: Set<string>;

  beforeEach(async () => {
    originalStaticPaths = new Set(staticPaths);
    staticRoot = await mkdtemp(join(tmpdir(), 'qwik-static-file-'));
    await writeFile(join(staticRoot, 'hello.txt'), 'static file content');
    await mkdir(join(staticRoot, 'blog', 'v1.2'), { recursive: true });
    await writeFile(join(staticRoot, 'blog', 'v1.2', 'index.html'), 'release page');
  });

  afterEach(async () => {
    for (const pathname of staticPaths) {
      if (!originalStaticPaths.has(pathname)) {
        staticPaths.delete(pathname);
      }
    }
    vi.unstubAllGlobals();
    await rm(staticRoot, { recursive: true, force: true });
  });

  const serveStaticFile = async (url: string) => {
    const chunks: Buffer[] = [];
    const response = Object.assign(
      new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
      }),
      { setHeader: vi.fn() }
    );
    const completion = finished(response);
    const middleware = createQwikRouter({ ...createNodeOptions(), static: { root: staticRoot } });

    await middleware.staticFile(
      { method: 'GET', url, headers: {} } as any,
      response as any,
      (error) => response.destroy(error ?? new Error('Static request was not handled'))
    );
    await completion;
    return Buffer.concat(chunks).toString();
  };

  it('serves a static file from under the base', async () => {
    vi.stubGlobal('__QWIK_ROUTER_BASE_PATHNAME__', '/docs/');
    staticPaths.add('/docs/hello.txt');

    expect(await serveStaticFile('/docs/hello.txt')).toBe('static file content');
  });

  it('serves a prerendered page whose folder name contains a dot', async () => {
    staticPaths.add('/blog/v1.2/');

    expect(await serveStaticFile('/blog/v1.2/')).toBe('release page');
  });
});
