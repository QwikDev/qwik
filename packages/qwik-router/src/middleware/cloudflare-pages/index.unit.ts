import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequestHandler } = vi.hoisted(() => ({
  mockRequestHandler: vi.fn(),
}));

vi.mock('@qwik.dev/core/build', () => ({
  isDev: false,
  isServer: true,
}));

vi.mock('@qwik.dev/core/server', () => ({
  setServerPlatform: vi.fn(),
}));

vi.mock('@qwik.dev/router/middleware/request-handler', () => ({
  _TextEncoderStream_polyfill: TextEncoderStream,
  getErrorHtml: vi.fn(),
  isStaticPath: vi.fn(() => false),
  mergeHeadersCookies: vi.fn((headers) => headers),
  requestHandler: mockRequestHandler,
}));

import { createQwikRouter } from './index';

describe('createQwikRouter()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns a null body for 304 responses', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRequestHandler.mockImplementation(async (serverRequestEv) => {
      let resolve!: (response: Response) => void;
      const response = new Promise<Response>((r) => (resolve = r));
      const stream = serverRequestEv.getWritableStream(
        304,
        new Headers({ ETag: '"resource"' }),
        { headers: () => [] },
        resolve
      );
      await stream.getWriter().close();
      return { completion: Promise.resolve(), response };
    });

    const handler = createQwikRouter({ render: vi.fn() } as any);
    const response = await handler(
      new Request('http://localhost/resource'),
      { ASSETS: { fetch: vi.fn() } },
      { waitUntil: vi.fn() }
    );

    expect(response.status, 'BODYLESS_304_STATUS').toBe(304);
    expect(response.body).toBeNull();
    expect(response.headers.get('ETag')).toBe('"resource"');
  });

  it.each(['private, no-cache', 'NO-STORE', 'no-cache'])(
    'does not store responses with Cache-Control: %s',
    async (cacheControl) => {
      const cache = mockCache();
      mockResponse(cacheControl);

      const handler = createQwikRouter({ render: vi.fn() } as any);
      await handler(
        new Request('https://example.com/account'),
        { ASSETS: { fetch: vi.fn() } },
        { waitUntil: vi.fn() }
      );

      expect(cache.put).not.toHaveBeenCalled();
    }
  );

  it('does not store responses that set cookies', async () => {
    const cache = mockCache();
    mockResponse('public, max-age=3600', { 'Set-Cookie': 'session=secret' });

    const handler = createQwikRouter({ render: vi.fn() } as any);
    await handler(
      new Request('https://example.com/account'),
      { ASSETS: { fetch: vi.fn() } },
      { waitUntil: vi.fn() }
    );

    expect(cache.put).not.toHaveBeenCalled();
  });

  it('stores public responses in the shared cache', async () => {
    const cache = mockCache();
    mockResponse('public, max-age=3600');

    const handler = createQwikRouter({ render: vi.fn() } as any);
    await handler(
      new Request('https://example.com/public'),
      { ASSETS: { fetch: vi.fn() } },
      { waitUntil: vi.fn() }
    );

    expect(cache.put).toHaveBeenCalledOnce();
  });

  it.each(['Cookie', 'Authorization'])('bypasses shared cache for %s requests', async (header) => {
    const open = vi.fn();
    vi.stubGlobal('caches', { open });
    mockResponse('public, max-age=3600');

    const handler = createQwikRouter({ render: vi.fn() } as any);
    await handler(
      new Request('https://example.com/account', { headers: { [header]: 'credential' } }),
      { ASSETS: { fetch: vi.fn() } },
      { waitUntil: vi.fn() }
    );

    expect(open).not.toHaveBeenCalled();
  });
});

const mockCache = () => {
  const cache = {
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  };
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
  return cache;
};

const mockResponse = (cacheControl: string, headers: Record<string, string> = {}) => {
  mockRequestHandler.mockResolvedValue({
    completion: Promise.resolve(),
    response: Promise.resolve(
      new Response('response', { headers: { 'Cache-Control': cacheControl, ...headers } })
    ),
  });
};
