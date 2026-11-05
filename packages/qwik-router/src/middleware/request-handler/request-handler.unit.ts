import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { _deserialize } from '@qwik.dev/core/internal';
import { FULLPATH_HEADER, ROUTE_PATH_HEADER } from '../../runtime/src/route-loaders';
import { _setRouterConfig } from '../../runtime/src/router-config';
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

_setRouterConfig({ routes: {}, basePathname: '/', cacheModules: false });

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

describe('onRequest url for q-loader requests', () => {
  const loaderPath = `/${getLoaderName('layout-loader', 'manifest')}`;
  let seenUrls: string[];

  beforeEach(() => {
    seenUrls = [];
    // A page's onRequest is skipped for loaders it does not declare; a layout's runs.
    const rootLayout = {
      useLayoutData: Object.assign(() => {}, { __brand: 'server_loader', __id: 'layout-loader' }),
      onRequest: ({ url, redirect }: any) => {
        seenUrls.push(url.pathname + url.search);
        throw redirect(302, `${url.pathname}step/`);
      },
    };
    const page = { default: () => null };
    _setRouterConfig({
      routes: { _L: () => rootLayout, _I: () => page, redirect: { _I: () => page } } as any,
      basePathname: '/',
      cacheModules: false,
    });
  });

  afterEach(() => {
    _setRouterConfig({ routes: {}, basePathname: '/', cacheModules: false });
  });

  async function handle(ev: ServerRequestEvent) {
    const result = await requestHandler(ev, { render: (async () => ({ html: '' })) as any });
    await result?.completion;
  }

  function readLoaderResponse(ev: ServerRequestEvent) {
    const writer = (ev.getWritableStream as any).mock.results[0].value.getWriter();
    return _deserialize(new TextDecoder().decode(writer.write.mock.calls[0][0]));
  }

  it.each([
    ['X-Qwik-route-path', ROUTE_PATH_HEADER],
    ['X-Qwik-fullpath', FULLPATH_HEADER],
  ])('shows the page url for a root layout loader request using %s', async (_, header) => {
    const ev = createMockServerRequestEvent(`http://localhost${loaderPath}?tab=1`, {
      headers: { [header]: '/redirect/' },
    });

    await handle(ev);

    expect(seenUrls).toEqual(['/redirect/?tab=1']);
    expect(await readLoaderResponse(ev)).toEqual({ r: '/redirect/step/' });
  });

  it.each([
    ['no route path', undefined],
    ['a protocol-relative route path', '//evil.example/redirect/'],
    ['a cross-origin route path', 'https://evil.example/redirect/'],
  ])('keeps the loader url for a loader request with %s', async (_, routePath) => {
    const ev = createMockServerRequestEvent(`http://localhost${loaderPath}`, {
      headers: routePath ? { [ROUTE_PATH_HEADER]: routePath } : undefined,
    });

    await handle(ev);

    expect(seenUrls).toEqual(['/']);
    expect(await readLoaderResponse(ev)).toEqual({ r: '/step/' });
  });

  it('keeps the request url for a page request', async () => {
    const ev = createMockServerRequestEvent('http://localhost/redirect/', {
      headers: { [ROUTE_PATH_HEADER]: '/other/' },
    });

    await handle(ev);

    expect(seenUrls).toEqual(['/redirect/']);
    expect((ev.getWritableStream as any).mock.calls[0][1].get('Location')).toBe('/redirect/step/');
  });
});
