import { createComputed$ } from '@qwik.dev/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchLoaderData } from './prefetch-route';
import type { RouteLoaderState } from './route-loaders';
import type { LoadedRoute } from './types';

const { fetchRouteLoaderDataMock } = vi.hoisted(() => ({
  fetchRouteLoaderDataMock: vi.fn(async () => ({ d: 'data' })),
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

/** Create an async computed signal holding a valid (fresh) value, like a route loader signal. */
const createFreshSignal = async () => {
  const signal = createComputed$(async () => 'fresh');
  await signal.promise();
  return signal;
};

describe('prefetchLoaderData', () => {
  beforeEach(() => {
    fetchRouteLoaderDataMock.mockClear();
  });

  it('fetches all loaders when no loader state is given', () => {
    prefetchLoaderData(
      createLoadedRoute(['a', 'b']),
      new URL('http://localhost/next/'),
      manifestHash
    );

    expect(fetchRouteLoaderDataMock).toHaveBeenCalledTimes(2);
  });

  it('skips loaders whose in-memory data has not expired', async () => {
    const staleSignal = await createFreshSignal();
    staleSignal.invalidate();
    const loaderState: RouteLoaderState = {
      fresh: await createFreshSignal(),
      stale: staleSignal,
    };

    prefetchLoaderData(
      createLoadedRoute(['fresh', 'stale', 'missing']),
      new URL('http://localhost/next/'),
      manifestHash,
      loaderState
    );

    const fetchedIds = fetchRouteLoaderDataMock.mock.calls.map(([id]: unknown[]) => id);
    expect(fetchedIds).toEqual(['stale', 'missing']);
  });
});
