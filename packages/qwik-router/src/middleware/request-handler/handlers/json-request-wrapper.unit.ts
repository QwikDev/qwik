import { describe, expect, it, vi } from 'vitest';
import { _deserialize } from '@qwik.dev/core/internal';
import { FULLPATH_HEADER, ROUTE_PATH_HEADER } from '../../../runtime/src/route-loaders';
import { createCacheControl } from '../cache-control';
import { RedirectMessage } from '../redirect-handler';
import { ServerError } from '../server-error';
import { IsQLoader } from '../request-path';
import type { CacheControl } from '../types';
import { jsonRequestWrapper } from './json-request-wrapper';

describe('jsonRequestWrapper', () => {
  it('rewrites loader requests only when X-Qwik-fullpath is below the loader path', async () => {
    const requestEv = createLoaderRequestEvent('/products/123/', '/products/123/view/');

    await jsonRequestWrapper()(requestEv as any);

    expect(requestEv.url.pathname).toBe('/products/123/view/');
    expect(requestEv.next).toHaveBeenCalledOnce();
  });

  it('rewrites loader requests using the dev X-Qwik-route-path header', async () => {
    const requestEv = createLoaderRequestEvent(
      '/products/123/',
      '/products/123/view/',
      ROUTE_PATH_HEADER
    );

    await jsonRequestWrapper()(requestEv as any);

    expect(requestEv.url.pathname).toBe('/products/123/view/');
  });

  it('ignores X-Qwik-fullpath when it does not have the loader path as a prefix', async () => {
    const requestEv = createLoaderRequestEvent('/products/123/', '/admin/');

    await jsonRequestWrapper()(requestEv as any);

    expect(requestEv.url.pathname).toBe('/products/123/');
    expect(requestEv.next).toHaveBeenCalledOnce();
  });

  it('adds Vary for X-Qwik-fullpath and the dev X-Qwik-route-path on loader requests', async () => {
    const requestEv = createLoaderRequestEvent('/products/123/', '/products/123/view/');
    requestEv.headers.set('Vary', 'Accept-Encoding');

    await jsonRequestWrapper()(requestEv as any);

    expect(requestEv.headers.get('Vary')).toBe(
      `Accept-Encoding, ${FULLPATH_HEADER}, ${ROUTE_PATH_HEADER}`
    );
  });

  it('serializes loader middleware redirects as loader responses', async () => {
    const requestEv = createLoaderRequestEvent('/products/123/', '/products/123/view/');
    requestEv.next = vi.fn(async () => {
      requestEv.headers.set('Location', '/login/');
      throw new RedirectMessage();
    });

    await jsonRequestWrapper()(requestEv as any);

    const [, body] = requestEv.send.mock.calls[0];
    expect(requestEv.headers.get('Location')).toBeNull();
    expect(requestEv.headers.get('Cache-Control')).toBe('no-cache, private');
    const result = await _deserialize(body);
    expect(result).toEqual({ r: '/login/' });
  });
  it.each([
    ['loader', 'a ServerError', new ServerError(403, 'Members only')],
    ['loader', 'a plain Error', new Error('middleware boom')],
    ['action', 'a ServerError', new ServerError(403, 'Members only')],
    ['action', 'a plain Error', new Error('middleware boom')],
  ] as const)(
    'sends %s middleware failures from %s with Cache-Control: no-store',
    async (internalRequest, _label, failure) => {
      const requestEv = createLoaderRequestEvent('/products/123/', '/products/123/view/');
      requestEv.internalRequest = internalRequest;
      requestEv.next = vi.fn(async () => {
        requestEv.headers.set('Cache-Control', 'public, max-age=60');
        throw failure;
      });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await jsonRequestWrapper()(requestEv as any);
      } finally {
        consoleError.mockRestore();
      }

      expect(requestEv.send).toHaveBeenCalledOnce();
      expect(requestEv.headers.get('Cache-Control')).toBe('no-store');
    }
  );
});

function createLoaderRequestEvent(
  loaderPathname: string,
  fullPathname: string,
  header = FULLPATH_HEADER
) {
  const headers = new Headers();
  return {
    sharedMap: new Map([[IsQLoader, true]]),
    internalRequest: 'loader' as 'loader' | 'action',
    request: new Request(`http://localhost${loaderPathname}`, {
      headers: {
        [header]: fullPathname,
      },
    }),
    url: new URL(`http://localhost${loaderPathname}`),
    headers,
    headersSent: false,
    cacheControl: vi.fn((value: CacheControl) => {
      headers.set('Cache-Control', createCacheControl(value));
    }),
    next: vi.fn(async () => {}),
    send: vi.fn(),
  };
}
