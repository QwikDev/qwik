import { _serialize } from '@qwik.dev/core/internal';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLoaderName } from '../../middleware/request-handler/request-path';
import {
  FULLPATH_HEADER,
  ROUTE_PATH_HEADER,
  clearNavFetchCache,
  fetchRouteLoaderData,
} from './route-loaders';
import { submitAction } from './use-endpoint';
import { loadRoute } from './routing';
import type { RouteData } from './types';

const previousStrictLoaders = globalThis.__STRICT_LOADERS__;

describe('submitAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    globalThis.__STRICT_LOADERS__ = previousStrictLoaders;
  });

  const makeJsonResponse = async (payload: object, status = 200) =>
    new Response(await _serialize(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  it('returns HTTP redirects without navigating from the transport', async () => {
    const response = new Response(null);
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: 'https://qwik.dev/next/' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const location = { origin: 'https://qwik.dev', href: 'https://qwik.dev/old/' };
    vi.stubGlobal('location', location);
    const result = await submitAction({ id: 'act-a', data: {} } as any, new URL(location.href));
    expect(result).toEqual({
      status: 200,
      result: undefined,
      redirect: new URL('https://qwik.dev/next/'),
    });
    expect(location.href).toBe('https://qwik.dev/old/');
  });

  it('clears action.data immediately after capture to prevent re-submission on task rerun', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(await makeJsonResponse({ result: { ok: true } }))
    );

    const action = { id: 'act-a', data: { name: 'Ada' } };
    await submitAction(action as any, new URL('https://qwik.dev/test/'));

    expect(action.data).toBeUndefined();
  });

  it('clears action.data even when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const action = { id: 'act-a', data: { field: 'value' } };
    await expect(submitAction(action as any, new URL('https://qwik.dev/test/'))).rejects.toThrow(
      'network error'
    );

    expect(action.data).toBeUndefined();
  });

  it('preserves route search params when appending the action id', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(await makeJsonResponse({ result: { ok: true } }));
    vi.stubGlobal('fetch', fetchSpy);

    await submitAction(
      { id: 'act-a', data: {} } as any,
      new URL('https://qwik.dev/test/?foo=bar&tag=a&tag=b')
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      '/test/?foo=bar&tag=a&tag=b&qaction=act-a',
      expect.any(Object)
    );
  });

  it('replaces any existing action id in route search params', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(await makeJsonResponse({ result: { ok: true } }));
    vi.stubGlobal('fetch', fetchSpy);

    await submitAction(
      { id: 'act-a', data: {} } as any,
      new URL('https://qwik.dev/test/?qaction=act-b&foo=bar&qaction=act-c')
    );

    expect(fetchSpy).toHaveBeenCalledWith('/test/?qaction=act-a&foo=bar', expect.any(Object));
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

    const result = await submitAction(
      { id: 'act-a', data: {} } as any,
      new URL('https://qwik.dev/test/')
    );

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

    const result = await submitAction(
      { id: 'act-a', data: {} } as any,
      new URL('https://qwik.dev/test/')
    );

    expect(result).toMatchObject({ status: 422, result: { failed: true } });
  });
});

describe('fetchRouteLoaderData', () => {
  it.each([
    { key: '_W', path: 'a%3Fb%23c%25d%2Fe', value: 'a?b#c%d/e' },
    { key: '_W', path: 'prea%3Fbpost', value: 'a?b', prefix: 'pre', suffix: 'post' },
    { key: '_A', path: 'a%3Fb/c%23d%25', value: 'a?b/c#d%' },
    { key: '_A', path: '', value: '' },
  ])('preserves encoded rewrite loader paths for $key: $path', async (entry) => {
    const parameter = { _P: 'id', _0: entry.prefix, _9: entry.suffix };
    const routes: RouteData = {
      target: {
        [entry.key]: { ...parameter, _R: ['layout'], _I: () => ({}) },
      },
      source: {
        [entry.key]: { ...parameter, _G: `target/${entry.key}` },
      },
    };
    const pageUrl = new URL(`https://qwik.dev/source/${entry.path}?filter=active`);
    const route = await loadRoute(routes, false, pageUrl.pathname);
    expect(route.$params$).toEqual({ id: entry.value });
    const expectedPath = entry.path ? `/target/${entry.path}/` : '/target/';
    expect(route.$loaderPaths$?.layout).toBe(expectedPath);
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchRouteLoaderData('layout', route.$loaderPaths$?.layout, 'dev', { pageUrl });

    const requestedUrl = new URL(fetchSpy.mock.calls[0][0], pageUrl);
    expect(requestedUrl.pathname).toBe(`${expectedPath}${getLoaderName('layout', 'dev')}`);
    expect(requestedUrl.search).toBe('?filter=active');
    expect(requestedUrl.hash).toBe('');
  });

  it('does not cache a response aborted just before publication', async () => {
    const response = new Response('stale');
    vi.spyOn(response, 'text').mockResolvedValue('stale');
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(new Response('fresh'));
    vi.stubGlobal('fetch', fetchSpy);
    const controller = new AbortController();
    const pending = fetchRouteLoaderData('publish-race', '/a/', 'dev', {
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(await fetchRouteLoaderData('publish-race', '/a/', 'dev')).toEqual({ raw: 'fresh' });
  });

  afterEach(() => {
    clearNavFetchCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['fetch', 'body'])('ignores cancellation-resistant %s responses', async (stage) => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const response = new Response('stale');
    const fetchSpy = vi
      .fn()
      .mockImplementationOnce(async () => {
        if (stage === 'fetch') {
          await gate;
        } else {
          vi.spyOn(response, 'text').mockImplementation(async () => {
            await gate;
            return 'stale';
          });
        }
        return response;
      })
      .mockResolvedValueOnce(new Response('fresh'));
    vi.stubGlobal('fetch', fetchSpy);
    const controller = new AbortController();
    const pending = fetchRouteLoaderData('canceled-response', '/a/', 'dev', {
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    finish();
    await rejected;
    expect(await fetchRouteLoaderData('canceled-response', '/a/', 'dev')).toEqual({ raw: 'fresh' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps late responses out of the next navigation cache', async () => {
    let finish!: (response: Response) => void;
    const fetchSpy = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValueOnce(new Response('fresh'));
    vi.stubGlobal('fetch', fetchSpy);
    const pending = fetchRouteLoaderData('previous-navigation', '/a/', 'dev', {
      signal: new AbortController().signal,
    });
    clearNavFetchCache();
    finish(new Response('stale'));
    await pending;
    expect(await fetchRouteLoaderData('previous-navigation', '/a/', 'dev')).toEqual({
      raw: 'fresh',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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

  it('keeps strict loader paths out of X-Qwik-fullpath', async () => {
    globalThis.__STRICT_LOADERS__ = true;
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('', {
        status: 404,
      })
    );
    vi.stubGlobal('fetch', fetchSpy);

    await fetchRouteLoaderData('root-loader', '/', 'manifest-hash', {
      pageUrl: new URL('http://localhost/products/123/?view=full'),
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `/${getLoaderName('root-loader', 'manifest-hash')}?view=full`,
      expect.objectContaining({
        headers: {
          [ROUTE_PATH_HEADER]: '/products/123/',
        },
      })
    );
  });

  it('converts unfollowed HTTP redirects into loader redirects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', {
          status: 302,
          headers: {
            Location: '/login/',
          },
        })
      )
    );

    await expect(
      fetchRouteLoaderData('loader-hash', '/products/123/', 'manifest-hash', {
        pageUrl: new URL('http://localhost/products/123/?view=full'),
      })
    ).resolves.toEqual({ r: '/login/' });
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

    await expect(Promise.all([first, second])).resolves.toEqual([{ raw: body }, { raw: body }]);
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
    await expect(prefetch).resolves.toEqual({ raw: body });
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

    expect(first).toEqual({ raw: body });
    expect(second).toEqual({ raw: body });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refetches after the per-navigation cache is cleared', async () => {
    const body = await _serialize({ d: 'cached' });
    const fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(new Response(body)));
    vi.stubGlobal('fetch', fetchSpy);

    const url = new URL('http://localhost/products/123/?view=full');
    await fetchRouteLoaderData('nav-cleared', '/products/123/', 'manifest-hash', {
      pageUrl: url,
    });
    clearNavFetchCache();
    await fetchRouteLoaderData('nav-cleared', '/products/123/', 'manifest-hash', {
      pageUrl: url,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('reuses a completed abortable loader request', async () => {
    const body = await _serialize({ d: 'cached' });
    const fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(new Response(body)));
    vi.stubGlobal('fetch', fetchSpy);

    const url = new URL('http://localhost/products/123/?view=full');
    await fetchRouteLoaderData('abort-cached', '/products/123/', 'manifest-hash', {
      pageUrl: url,
      signal: new AbortController().signal,
    });
    await fetchRouteLoaderData('abort-cached', '/products/123/', 'manifest-hash', {
      pageUrl: url,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
