import { describe, expect, it, vi } from 'vitest';
import { FULLPATH_HEADER } from '../../../runtime/src/route-loaders';
import { getLoaderName, IsQLoader, QLoaderId } from '../request-path';
import { loaderHandler } from './loader-handler';

describe('loaderHandler', () => {
  function createRequestEv() {
    return {
      sharedMap: new Map<string, unknown>([
        [IsQLoader, true],
        [QLoaderId, 'loader-id'],
      ]),
      headers: new Headers(),
      request: new Request(`http://localhost/products/${getLoaderName('loader-id', 'manifest')}`),
      url: new URL('http://localhost/products/'),
      headersSent: false,
      exited: false,
      cacheControl: vi.fn(),
      send: vi.fn(),
      status: vi.fn(() => 200),
    };
  }

  it('uses millisecond expires values to derive Cache-Control seconds and varies on full path', async () => {
    const requestEv = createRequestEv();
    const loader = {
      __id: 'loader-id',
      __qrl: {
        call: vi.fn(async () => 'loader-value'),
      },
      __validators: undefined,
      __expires: 1500,
      __eTag: undefined,
      __cacheKey: undefined,
      __search: undefined,
    };

    await loaderHandler([loader as any])(requestEv as any);

    expect(requestEv.cacheControl).toHaveBeenCalledWith({ maxAge: 2 });
    expect(requestEv.headers.get('Vary')).toBe(FULLPATH_HEADER);
    expect(requestEv.send).toHaveBeenCalledWith(200, expect.any(String));
  });

  it('passes normalized unquoted eTags to cacheKey callbacks and quotes only response headers', async () => {
    const requestEv = createRequestEv();
    const cacheKey = vi.fn(() => `loader-cache-${Date.now()}`);
    const loader = {
      __id: 'loader-id',
      __qrl: {
        call: vi.fn(async () => 'loader-value'),
      },
      __validators: undefined,
      __expires: undefined,
      __eTag: '  W/"a b\tc"  ',
      __cacheKey: cacheKey,
      __search: undefined,
    };

    await loaderHandler([loader as any])(requestEv as any);

    expect(cacheKey).toHaveBeenCalledWith(requestEv, 'abc');
    expect(requestEv.headers.get('ETag')).toBe('"abc"');
    expect(requestEv.send).toHaveBeenCalledWith(200, expect.any(String));
  });

  it('treats empty normalized eTags as absent', async () => {
    const requestEv = createRequestEv();
    const cacheKey = vi.fn(() => null);
    const loader = {
      __id: 'loader-id',
      __qrl: {
        call: vi.fn(async () => 'loader-value'),
      },
      __validators: undefined,
      __expires: undefined,
      __eTag: '""',
      __cacheKey: cacheKey,
      __search: undefined,
    };

    await loaderHandler([loader as any])(requestEv as any);

    expect(cacheKey).toHaveBeenCalledWith(requestEv, '');
    expect(requestEv.headers.has('ETag')).toBe(false);
    expect(requestEv.send).toHaveBeenCalledWith(200, expect.any(String));
  });
});
