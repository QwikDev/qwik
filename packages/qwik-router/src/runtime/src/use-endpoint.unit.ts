import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLoaderName } from '../../middleware/request-handler/request-path';
import { FULLPATH_HEADER, fetchRouteLoaderData } from './route-loaders';

describe('fetchRouteLoaderData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns undefined when the loader is not valid for the current route', async () => {
    await expect(
      fetchRouteLoaderData('loader-hash', undefined, 'manifest-hash')
    ).resolves.toBeUndefined();
  });

  it('bypasses the browser cache when forced', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('', {
        status: 404,
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await fetchRouteLoaderData('loader-hash', '/products/123/', 'manifest-hash', {
      pageUrl: new URL('http://localhost/products/123/?view=full'),
      ignoreCache: true,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/products/123/${getLoaderName('loader-hash', 'manifest-hash')}?view=full`,
      expect.objectContaining({
        cache: 'reload',
      })
    );
  });

  it('sends X-Qwik-fullpath when fetching a loader for a deeper page path', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('', {
        status: 404,
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await fetchRouteLoaderData('loader-hash', '/products/123/', 'manifest-hash', {
      pageUrl: new URL('http://localhost/products/123/view/?tab=details'),
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/products/123/${getLoaderName('loader-hash', 'manifest-hash')}?tab=details`,
      expect.objectContaining({
        headers: {
          [FULLPATH_HEADER]: '/products/123/view/',
        },
      })
    );
  });
});
