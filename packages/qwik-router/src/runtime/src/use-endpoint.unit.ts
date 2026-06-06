import { _serialize } from '@qwik.dev/core/internal';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLoaderName } from '../../middleware/request-handler/request-path';
import { FULLPATH_HEADER, fetchRouteLoaderData } from './route-loaders';
import { submitAction } from './use-endpoint';

describe('submitAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const makeJsonResponse = async (payload: object, status = 200) =>
    new Response(await _serialize(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  it('clears action.data immediately after capture to prevent re-submission on task rerun', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(await makeJsonResponse({ result: { ok: true } }))
    );

    const action = { id: 'act-a', data: { name: 'Ada' } };
    await submitAction(action as any, '/test/');

    expect(action.data).toBeUndefined();
  });

  it('clears action.data even when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const action = { id: 'act-a', data: { field: 'value' } };
    await expect(submitAction(action as any, '/test/')).rejects.toThrow('network error');

    expect(action.data).toBeUndefined();
  });

  it('returns result and status from JSON action response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          await makeJsonResponse({ result: { ok: true }, loaderHashes: ['hash-1'] }, 200)
        )
    );

    const result = await submitAction({ id: 'act-a', data: {} } as any, '/test/');

    expect(result).toEqual({
      status: 200,
      result: { ok: true },
      loaderHashes: ['hash-1'],
      redirect: undefined,
    });
  });

  it('reflects non-200 status from action response (fail/validator)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          await makeJsonResponse({ result: { failed: true, message: 'bad' } }, 422)
        )
    );

    const result = await submitAction({ id: 'act-a', data: {} } as any, '/test/');

    expect(result?.status).toBe(422);
    expect(result?.result).toMatchObject({ failed: true });
  });
});

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

  it('dedupes concurrent loader fetches for the same request', async () => {
    const body = await _serialize({ d: 'prefetched' });
    let resolveFetch: (() => void) | undefined;
    const fetchSpy = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = () => resolve(new Response(body));
        })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const url = new URL('http://localhost/products/123/?view=full');
    const first = fetchRouteLoaderData('dedupe-concurrent', '/products/123/', 'manifest-hash', {
      pageUrl: url,
    });
    const second = fetchRouteLoaderData('dedupe-concurrent', '/products/123/', 'manifest-hash', {
      pageUrl: url,
      signal: new AbortController().signal,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    resolveFetch!();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { d: 'prefetched' },
      { d: 'prefetched' },
    ]);
  });

  it('lets an abortable caller stop waiting for a shared prefetch', async () => {
    const body = await _serialize({ d: 'prefetched' });
    let resolveFetch: (() => void) | undefined;
    const fetchSpy = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = () => resolve(new Response(body));
        })
    );
    vi.stubGlobal('fetch', fetchSpy);

    const url = new URL('http://localhost/products/123/?view=full');
    const prefetch = fetchRouteLoaderData('abort-shared', '/products/123/', 'manifest-hash', {
      pageUrl: url,
    });
    const controller = new AbortController();
    const navigation = fetchRouteLoaderData('abort-shared', '/products/123/', 'manifest-hash', {
      pageUrl: url,
      signal: controller.signal,
    });

    controller.abort('stale navigation');
    await expect(navigation).rejects.toBe('stale navigation');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch!();
    await expect(prefetch).resolves.toEqual({ d: 'prefetched' });
  });

  it('reuses a recently completed loader fetch', async () => {
    const body = await _serialize({ d: 'cached' });
    const fetchSpy = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal('fetch', fetchSpy);

    const url = new URL('http://localhost/products/123/?view=full');
    const first = await fetchRouteLoaderData(
      'dedupe-completed',
      '/products/123/',
      'manifest-hash',
      {
        pageUrl: url,
      }
    );
    const second = await fetchRouteLoaderData(
      'dedupe-completed',
      '/products/123/',
      'manifest-hash',
      {
        pageUrl: url,
      }
    );

    expect(first).toEqual({ d: 'cached' });
    expect(second).toEqual({ d: 'cached' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not let abortable requests populate the shared loader fetch cache', async () => {
    const body = await _serialize({ d: 'uncached' });
    const fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(new Response(body)));
    vi.stubGlobal('fetch', fetchSpy);

    const url = new URL('http://localhost/products/123/?view=full');
    await fetchRouteLoaderData('abort-uncached', '/products/123/', 'manifest-hash', {
      pageUrl: url,
      signal: new AbortController().signal,
    });
    await fetchRouteLoaderData('abort-uncached', '/products/123/', 'manifest-hash', {
      pageUrl: url,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
