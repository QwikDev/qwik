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
});
