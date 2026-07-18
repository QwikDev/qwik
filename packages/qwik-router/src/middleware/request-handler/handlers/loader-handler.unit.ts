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
      url: new URL('http://localhost/products/?q=shoes&page=2&ignored=true'),
      headersSent: false,
      exited: false,
      cacheControl: vi.fn(),
      json: vi.fn(),
      send: vi.fn(),
      status: vi.fn(() => 200),
    };
  }

  it('uses expires values for private Cache-Control and varies on full path', async () => {
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

    expect(requestEv.cacheControl).toHaveBeenCalledWith({ maxAge: 2, private: true });
    expect(requestEv.headers.get('Vary')).toBe(FULLPATH_HEADER);
    expect(requestEv.send).toHaveBeenCalledWith(200, expect.any(String));
  });

  it('passes normalized unquoted eTags to cacheKey callbacks and quotes only response headers', async () => {
    const requestEv = createRequestEv();
    const cacheKey = vi.fn((_ev: any, _eTag: string) => `loader-cache-${Date.now()}`);
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

    const cacheKeyEv = cacheKey.mock.calls[0][0];
    expect(cacheKeyEv.url.href).toBe(requestEv.url.href);
    expect(cacheKey).toHaveBeenCalledWith(cacheKeyEv, 'abc');
    expect(requestEv.headers.get('ETag')).toBe('"abc"');
    expect(requestEv.send).toHaveBeenCalledWith(200, expect.any(String));
  });

  it('passes filtered request URL to cacheKey callbacks', async () => {
    const requestEv = createRequestEv();
    const cacheKey = vi.fn((ev) => `key:${ev.url.search}`);
    const loader = {
      __id: 'loader-id',
      __qrl: {
        call: vi.fn(async () => 'loader-value'),
      },
      __validators: undefined,
      __expires: undefined,
      __eTag: undefined,
      __cacheKey: cacheKey,
      __search: ['page', 'q'],
    };

    await loaderHandler([loader as any])(requestEv as any);

    const cacheKeyEv = cacheKey.mock.calls[0][0];
    expect(cacheKeyEv).not.toBe(requestEv);
    expect(cacheKeyEv.url.search).toBe('?page=2&q=shoes');
    expect(cacheKeyEv.request.url).toBe(requestEv.request.url);
    expect(cacheKey).toHaveBeenCalledWith(cacheKeyEv, '');
    expect(requestEv.send).toHaveBeenCalledWith(200, expect.any(String));
  });

  it('runs loader functions with the filtered request URL', async () => {
    const requestEv = createRequestEv();
    const loader = {
      __id: 'loader-id',
      __qrl: {
        call: vi.fn(async (_thisArg, ev) => ({
          requestUrl: ev.request.url,
          search: ev.url.search,
          q: ev.query.get('q'),
          ignored: ev.query.has('ignored'),
        })),
      },
      __validators: undefined,
      __expires: undefined,
      __eTag: undefined,
      __cacheKey: undefined,
      __search: ['q'],
    };

    await loaderHandler([loader as any])(requestEv as any);

    const loaderEv = loader.__qrl.call.mock.calls[0][1];
    expect(loaderEv.url.search).toBe('?q=shoes');
    expect(loaderEv.query.get('q')).toBe('shoes');
    expect(loaderEv.query.has('ignored')).toBe(false);
    expect(loaderEv.request.url).toBe(requestEv.request.url);
    expect(requestEv.send).toHaveBeenCalledWith(200, expect.any(String));
  });

  it('returns 404 when the requested loader is not available on the matched route', async () => {
    const requestEv = createRequestEv();

    await loaderHandler([])(requestEv as any);

    expect(requestEv.json).toHaveBeenCalledWith(404, { error: 'Loader not found' });
    expect(requestEv.send).not.toHaveBeenCalled();
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

    expect(cacheKey).toHaveBeenCalledWith(expect.any(Object), '');
    expect(requestEv.headers.has('ETag')).toBe(false);
    expect(requestEv.send).toHaveBeenCalledWith(200, expect.any(String));
  });
});
