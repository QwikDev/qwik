import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchLoaderData } from './prefetch-route';
import type { LoadedRoute } from './types';

const { fetchRouteLoaderDataMock } = vi.hoisted(() => ({
  fetchRouteLoaderDataMock: vi.fn(async () => ({ raw: 'data' })),
}));

vi.mock('@qwik-router-config', () => ({
  routes: [],
  cacheModules: false,
  basePathname: '/',
}));

vi.mock('@qwik.dev/core/preloader', () => ({ p: vi.fn() }));

vi.mock('./route-loaders', () => ({ fetchRouteLoaderData: fetchRouteLoaderDataMock }));

const manifestHash = 'test-manifest';

const createLoadedRoute = (loaderIds: string[]) =>
  ({
    $routeName$: 'next/',
    $loaders$: loaderIds,
    $loaderPaths$: Object.fromEntries(loaderIds.map((id) => [id, '/next/'])),
  }) as unknown as LoadedRoute;

describe('prefetchLoaderData', () => {
  beforeEach(() => {
    fetchRouteLoaderDataMock.mockClear();
  });

  it('fetches every loader of the route', () => {
    prefetchLoaderData(
      createLoadedRoute(['a', 'b']),
      new URL('http://localhost/next/'),
      manifestHash
    );

    expect(fetchRouteLoaderDataMock).toHaveBeenCalledTimes(2);
  });

  it('skips loaders without a fetch path', () => {
    const loadedRoute = createLoadedRoute(['a', 'pathless']);
    (loadedRoute.$loaderPaths$ as Record<string, string | undefined>).pathless = undefined;

    prefetchLoaderData(loadedRoute, new URL('http://localhost/next/'), manifestHash);

    const fetchedIds = fetchRouteLoaderDataMock.mock.calls.map(([id]: unknown[]) => id);
    expect(fetchedIds).toEqual(['a']);
  });
});
