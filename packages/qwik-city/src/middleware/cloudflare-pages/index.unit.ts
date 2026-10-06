import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequestHandler } = vi.hoisted(() => ({
  mockRequestHandler: vi.fn(),
}));

vi.mock('@builder.io/qwik', () => ({
  _deserializeData: vi.fn(),
  _serializeData: vi.fn(),
  _verifySerializable: vi.fn(),
}));

vi.mock('@builder.io/qwik/server', () => ({
  setServerPlatform: vi.fn(),
}));

vi.mock('@qwik-city-not-found-paths', () => ({
  getNotFound: vi.fn(() => 'Not Found'),
}));

vi.mock('@qwik-city-static-paths', () => ({
  isStaticPath: vi.fn(() => false),
}));

vi.mock('@builder.io/qwik-city/middleware/request-handler', async () => ({
  ServerError: (await import('../request-handler/server-error')).ServerError,
  _TextEncoderStream_polyfill: TextEncoderStream,
  mergeHeadersCookies: vi.fn((headers) => headers),
  requestHandler: mockRequestHandler,
}));

import { createQwikCity } from './index';

describe('createQwikCity()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['private, no-cache', 'NO-STORE', 'no-cache'])(
    'does not store responses with Cache-Control: %s',
    async (cacheControl) => {
      const cache = mockCache();
      mockResponse(cacheControl);

      const handler = createQwikCity({ render: vi.fn() } as any);
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

    const handler = createQwikCity({ render: vi.fn() } as any);
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

    const handler = createQwikCity({ render: vi.fn() } as any);
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

    const handler = createQwikCity({ render: vi.fn() } as any);
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
