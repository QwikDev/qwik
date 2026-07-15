import { describe, it, expect, vi } from 'vitest';
import { FULLPATH_HEADER, ROUTE_PATH_HEADER } from '../../runtime/src/route-loaders';
import { getLoaderName } from './request-path';
import { getRequestHandlerPathname, requestHandler } from './request-handler';
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
        pipeTo: vi.fn(),
      } as any;
    }),
  } as unknown as ServerRequestEvent;
}

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

  it('uses the validated route pathname for strict dev loader requests', () => {
    const ev = createMockServerRequestEvent(
      `http://localhost/products/${getLoaderName('loader-id', 'manifest')}`,
      {
        headers: {
          [ROUTE_PATH_HEADER]: '/products/123/',
        },
      }
    );

    expect(getRequestHandlerPathname(ev)).toBe('/products/123/');
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
