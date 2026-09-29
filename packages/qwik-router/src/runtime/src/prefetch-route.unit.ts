import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchLoaderData } from './prefetch-route';
import type { LoadedRoute, LoaderInternal } from './types';

const { fetchRouteLoaderDataMock } = vi.hoisted(() => ({
  fetchRouteLoaderDataMock: vi.fn(async () => ({ raw: 'data' })),
}));

vi.mock('@qwik-router-config', () => ({
  routes: [],
  cacheModules: false,
  basePathname: '/',
}));

vi.mock('@qwik.dev/core/preloader', () => ({ p: vi.fn() }));

vi.mock('./route-loaders', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRouteLoaderData: fetchRouteLoaderDataMock,
}));

const manifestHash = 'test-manifest';

const createLoader = (id: string, cacheControl?: LoaderInternal['__cacheControl']) => {
  const loader = () => null;
  loader.__brand = 'server_loader' as const;
  loader.__id = id;
  loader.__cacheControl = cacheControl;
  return loader as unknown as LoaderInternal;
};

const createLoadedRoute = (loaders: LoaderInternal[]) =>
  ({
    $routeName$: 'next/',
    $mods$: [Object.fromEntries(loaders.map((loader) => [`use_${loader.__id}`, loader]))],
    $loaders$: loaders.map((loader) => loader.__id),
    $loaderPaths$: Object.fromEntries(loaders.map((loader) => [loader.__id, '/next/'])),
  }) as unknown as LoadedRoute;

describe('prefetchLoaderData', () => {
  beforeEach(() => {
    fetchRouteLoaderDataMock.mockClear();
  });

  it('fetches every loader of the route', () => {
    prefetchLoaderData(
      createLoadedRoute([createLoader('a'), createLoader('b')]),
      new URL('http://localhost/next/'),
      manifestHash
    );

    expect(fetchRouteLoaderDataMock).toHaveBeenCalledTimes(2);
  });

  it('skips immutable loaders so they download lazily on first read', () => {
    prefetchLoaderData(
      createLoadedRoute([createLoader('a'), createLoader('static', 'immutable')]),
      new URL('http://localhost/next/'),
      manifestHash
    );

    const fetchedIds = fetchRouteLoaderDataMock.mock.calls.map(([id]: unknown[]) => id);
    expect(fetchedIds).toEqual(['a']);
  });

  it('skips loaders without a fetch path', () => {
    const loadedRoute = createLoadedRoute([createLoader('a'), createLoader('pathless')]);
    (loadedRoute.$loaderPaths$ as Record<string, string | undefined>).pathless = undefined;

    prefetchLoaderData(loadedRoute, new URL('http://localhost/next/'), manifestHash);

    const fetchedIds = fetchRouteLoaderDataMock.mock.calls.map(([id]: unknown[]) => id);
    expect(fetchedIds).toEqual(['a']);
  });
});
