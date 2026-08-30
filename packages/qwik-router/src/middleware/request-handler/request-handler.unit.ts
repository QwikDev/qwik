import { afterEach, describe, it, expect, vi } from 'vitest';
import { FULLPATH_HEADER, ROUTE_PATH_HEADER } from '../../runtime/src/route-loaders';
import { getLoaderName } from './request-path';
import { getRequestHandlerPathname, requestHandler } from './request-handler';
import { getStaticPathRedirect, isStaticPath, staticPaths } from './static-paths';
import type { ServerRequestEvent } from './types';

function createMockServerRequestEvent(url = 'http://localhost/.well-known', init?: RequestInit) {
  const mockRequest = new Request(url, init);

  return {
    mode: 'server',
    url: new URL(url),
    locale: undefined,
    platform: {},
    request: mockRequest,
    env: {
      get: vi.fn(),
    },
    getClientConn: vi.fn(() => ({ ip: '127.0.0.1' })),
    getWritableStream: vi.fn(() => {
      const writer = {
        write: vi.fn(),
        close: vi.fn(),
      } as any;
      return {
        getWriter: () => writer,
        locked: false,
        close: vi.fn(),
        pipeTo: vi.fn(),
      } as any;
    }),
  } as unknown as ServerRequestEvent;
}

afterEach(() => {
  staticPaths.delete('/playground/');
  staticPaths.delete('//evil/');
  globalThis.__NO_TRAILING_SLASH__ = false;
});

describe('requestHandler .well-known ignore', () => {
  it('returns null for /.well-known', async () => {
    const ev = createMockServerRequestEvent('http://localhost/.well-known');
    const result = await requestHandler(ev, {
      render: (async () => ({ html: '' })) as any,
    });
    expect(result).toBeNull();
  });

  it('returns null for /.well-known/other', async () => {
    const ev = createMockServerRequestEvent('http://localhost/.well-known/acme-challenge/token');
    const result = await requestHandler(ev, {
      render: (async () => ({ html: '' })) as any,
    });
    expect(result).toBeNull();
  });
});

it.each([
  [false, '/playground?mode=prod', '/playground/?mode=prod'],
  [true, '/playground/?mode=prod', '/playground?mode=prod'],
])(
  'redirects a prerendered route to its configured slash form',
  async (noSlash, path, location) => {
    globalThis.__NO_TRAILING_SLASH__ = noSlash;
    staticPaths.add('/playground/');
    const ev = createMockServerRequestEvent(`http://localhost${path}`);

    expect(isStaticPath('GET', ev.url)).toBe(false);
    const canonicalUrl = new URL(location, ev.url);
    expect(isStaticPath('GET', canonicalUrl)).toBe(true);
    expect(getStaticPathRedirect('GET', canonicalUrl)).toBeUndefined();

    const result = await requestHandler(ev, {
      render: (async () => ({ html: '' })) as any,
    });
    await result?.completion;

    expect(ev.getWritableStream).toHaveBeenCalledWith(
      301,
      expect.objectContaining({}),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect((ev.getWritableStream as any).mock.calls[0][1].get('Location')).toBe(location);
  }
);

it('does not create protocol-relative static redirects', () => {
  staticPaths.add('//evil/');
  expect(getStaticPathRedirect('GET', new URL('http://localhost//evil'))).toBeUndefined();
});

describe('getRequestHandlerPathname', () => {
  it('uses the validated full pathname for q-loader requests', () => {
    const ev = createMockServerRequestEvent(
      `http://localhost/products/${getLoaderName('loader-id', 'manifest')}`,
      {
        headers: {
          [FULLPATH_HEADER]: '/products/123/',
        },
      }
    );

    expect(getRequestHandlerPathname(ev)).toBe('/products/123/');
  });

  it('ignores the strict dev route pathname outside dev mode', () => {
    const ev = createMockServerRequestEvent(
      `http://localhost/products/${getLoaderName('loader-id', 'manifest')}`,
      {
        headers: {
          [ROUTE_PATH_HEADER]: '/products/123/',
        },
      }
    );

    expect(getRequestHandlerPathname(ev, false)).toBe('/products/');
  });

  it('uses the validated route pathname for strict dev loader requests in dev mode', () => {
    const ev = createMockServerRequestEvent(
      `http://localhost/products/${getLoaderName('loader-id', 'manifest')}`,
      {
        headers: {
          [ROUTE_PATH_HEADER]: '/products/123/',
        },
      }
    );

    expect(getRequestHandlerPathname(ev, true)).toBe('/products/123/');
  });

  it('ignores a strict dev route pathname outside the loader path', () => {
    const ev = createMockServerRequestEvent(
      `http://localhost/products/${getLoaderName('loader-id', 'manifest')}`,
      {
        headers: {
          [ROUTE_PATH_HEADER]: '/admin/',
        },
      }
    );

    expect(getRequestHandlerPathname(ev)).toBe('/products/');
  });

  it('uses the loader pathname when X-Qwik-fullpath is outside the loader pathname', () => {
    const ev = createMockServerRequestEvent(
      `http://localhost/products/${getLoaderName('loader-id', 'manifest')}`,
      {
        headers: {
          [FULLPATH_HEADER]: '/admin/',
        },
      }
    );

    expect(getRequestHandlerPathname(ev)).toBe('/products/');
  });

  it('ignores X-Qwik-fullpath for normal page requests', () => {
    const ev = createMockServerRequestEvent('http://localhost/products/', {
      headers: {
        [FULLPATH_HEADER]: '/products/123/',
      },
    });

    expect(getRequestHandlerPathname(ev)).toBe('/products/');
  });
});
