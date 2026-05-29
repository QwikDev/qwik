import { describe, expect, it, vi } from 'vitest';
import { FULLPATH_HEADER } from '../../../runtime/src/route-loaders';
import { IsQLoader } from '../request-path';
import { jsonRequestWrapper } from './json-request-wrapper';

describe('jsonRequestWrapper', () => {
  it('rewrites loader requests only when X-Qwik-fullpath is below the loader path', async () => {
    const requestEv = createLoaderRequestEvent('/products/123/', '/products/123/view/');

    await jsonRequestWrapper()(requestEv as any);

    expect(requestEv.url.pathname).toBe('/products/123/view/');
    expect(requestEv.next).toHaveBeenCalledOnce();
  });

  it('ignores X-Qwik-fullpath when it does not have the loader path as a prefix', async () => {
    const requestEv = createLoaderRequestEvent('/products/123/', '/admin/');

    await jsonRequestWrapper()(requestEv as any);

    expect(requestEv.url.pathname).toBe('/products/123/');
    expect(requestEv.next).toHaveBeenCalledOnce();
  });

  it('adds Vary for X-Qwik-fullpath on loader requests', async () => {
    const requestEv = createLoaderRequestEvent('/products/123/', '/products/123/view/');
    requestEv.headers.set('Vary', 'Accept-Encoding');

    await jsonRequestWrapper()(requestEv as any);

    expect(requestEv.headers.get('Vary')).toBe(`Accept-Encoding, ${FULLPATH_HEADER}`);
  });
});

function createLoaderRequestEvent(loaderPathname: string, fullPathname: string) {
  return {
    sharedMap: new Map([[IsQLoader, true]]),
    request: new Request(`http://localhost${loaderPathname}`, {
      headers: {
        [FULLPATH_HEADER]: fullPathname,
      },
    }),
    url: new URL(`http://localhost${loaderPathname}`),
    headers: new Headers(),
    headersSent: false,
    next: vi.fn(async () => {}),
  };
}
