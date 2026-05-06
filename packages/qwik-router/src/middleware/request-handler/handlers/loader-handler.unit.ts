import { describe, expect, it, vi } from 'vitest';
import { FULLPATH_HEADER } from '../../../runtime/src/route-loaders';
import { getLoaderName, IsQLoader, QLoaderId } from '../request-path';
import { loaderHandler } from './loader-handler';

describe('loaderHandler', () => {
  it('uses millisecond expires values to derive Cache-Control seconds and varies on full path', async () => {
    const requestEv = {
      sharedMap: new Map<string, unknown>([
        [IsQLoader, true],
        [QLoaderId, 'loader-id'],
      ]),
      headers: new Headers(),
      request: new Request(`http://localhost/products/${getLoaderName('loader-id', 'manifest')}`),
      headersSent: false,
      exited: false,
      cacheControl: vi.fn(),
      send: vi.fn(),
      status: vi.fn(() => 200),
    };
    const loader = {
      __id: 'loader-id',
      __qrl: {
        call: vi.fn(async () => 'loader-value'),
      },
      __validators: undefined,
      __expires: 1500,
      __eTag: undefined,
    };

    await loaderHandler([loader as any])(requestEv as any);

    expect(requestEv.cacheControl).toHaveBeenCalledWith({ maxAge: 2 });
    expect(requestEv.headers.get('Vary')).toBe(FULLPATH_HEADER);
    expect(requestEv.send).toHaveBeenCalledWith(200, expect.any(String));
  });
});
