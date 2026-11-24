import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchLoaderData } from './prefetch-route';
import { _setRouterConfig } from './router-config';
import type { LoadedRoute, LoaderInternal } from './types';

const { fetchRouteLoaderDataMock } = vi.hoisted(() => ({
  fetchRouteLoaderDataMock: vi.fn(async () => ({ raw: 'data' })),
}));

_setRouterConfig({ routes: {}, cacheModules: false, basePathname: '/' });

vi.mock('./route-loaders', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRouteLoaderData: fetchRouteLoaderDataMock,
}));

const manifestHash = 'test-manifest';

// As in a build: the route tree lists a loader by its QRL hash, which is its id unless it sets `id`.
const createLoader = (
  id: string,
  {
    hash = id,
    cacheControl,
    search,
  }: {
    hash?: string;
    cacheControl?: LoaderInternal['__cacheControl'];
    search?: string[];
  } = {}
) => {
  const loader = () => null;
  loader.__brand = 'server_loader' as const;
  loader.__id = id;
  loader.__qrl = { getHash: vi.fn(() => hash) };
  loader.__cacheControl = cacheControl;
  loader.__search = search;
  return loader as unknown as LoaderInternal;
};

const createLoadedRoute = (loaders: LoaderInternal[]) => {
  const hashes = loaders.map((loader) => loader.__qrl.getHash());
  return {
    $routeName$: 'next/',
    $mods$: [Object.fromEntries(loaders.map((loader) => [`use_${loader.__id}`, loader]))],
    $loaders$: hashes,
    $loaderPaths$: Object.fromEntries(hashes.map((hash) => [hash, '/next/'])),
  } as unknown as LoadedRoute;
};

const fetchedIds = () => fetchRouteLoaderDataMock.mock.calls.map(([id]: unknown[]) => id);

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
      createLoadedRoute([createLoader('a'), createLoader('static', { cacheControl: 'immutable' })]),
      new URL('http://localhost/next/'),
      manifestHash
    );

    expect(fetchedIds()).toEqual(['a']);
  });

  it('skips loaders without a fetch path', () => {
    const loadedRoute = createLoadedRoute([createLoader('a'), createLoader('pathless')]);
    (loadedRoute.$loaderPaths$ as Record<string, string | undefined>).pathless = undefined;

    prefetchLoaderData(loadedRoute, new URL('http://localhost/next/'), manifestHash);

    expect(fetchedIds()).toEqual(['a']);
  });

  it('fetches a loader with a custom id by its id, as a navigation does', () => {
    prefetchLoaderData(
      createLoadedRoute([createLoader('custom', { hash: 'h4shOfCustom' })]),
      new URL('http://localhost/next/'),
      manifestHash
    );

    expect(fetchedIds()).toEqual(['custom']);
  });

  it('skips an immutable loader with a custom id', () => {
    prefetchLoaderData(
      createLoadedRoute([
        createLoader('a'),
        createLoader('static', { hash: 'h4shOfStatic', cacheControl: 'immutable' }),
      ]),
      new URL('http://localhost/next/'),
      manifestHash
    );

    expect(fetchedIds()).toEqual(['a']);
  });

  it("narrows the page url to the loader's search params, as a navigation does", () => {
    prefetchLoaderData(
      createLoadedRoute([
        createLoader('filtered', { search: ['page', 'sort'] }),
        createLoader('all'),
      ]),
      new URL('http://localhost/next/?utm_source=x&sort=asc&page=2'),
      manifestHash
    );

    const pageUrls = Object.fromEntries(
      fetchRouteLoaderDataMock.mock.calls.map(([id, , , opts]: unknown[]) => [
        id,
        (opts as { pageUrl: URL }).pageUrl.search,
      ])
    );
    expect(pageUrls).toEqual({
      filtered: '?page=2&sort=asc',
      all: '?utm_source=x&sort=asc&page=2',
    });
  });

  it('prefetches each loader that shares a QRL hash, by its own id', () => {
    prefetchLoaderData(
      createLoadedRoute([
        createLoader('first', { hash: 'sharedWrapper' }),
        createLoader('second', { hash: 'sharedWrapper' }),
      ]),
      new URL('http://localhost/next/'),
      manifestHash
    );

    expect(fetchedIds()).toEqual(['first', 'second']);
  });

  it('prefetches a loader that shares a QRL hash with an immutable one', () => {
    prefetchLoaderData(
      createLoadedRoute([
        createLoader('static', { hash: 'sharedWrapper', cacheControl: 'immutable' }),
        createLoader('live', { hash: 'sharedWrapper' }),
      ]),
      new URL('http://localhost/next/'),
      manifestHash
    );

    expect(fetchedIds()).toEqual(['live']);
  });

  it("falls back to the hash for a loader it can't find in the route's modules", () => {
    const loadedRoute = createLoadedRoute([createLoader('a')]);
    (loadedRoute.$loaders$ as string[]).push('orphan');
    (loadedRoute.$loaderPaths$ as Record<string, string>).orphan = '/next/';

    prefetchLoaderData(loadedRoute, new URL('http://localhost/next/'), manifestHash);

    expect(fetchedIds()).toEqual(['a', 'orphan']);
  });

  it("reads each loader's hash from its QRL", () => {
    const loader = createLoader('a');
    const loadedRoute = createLoadedRoute([loader]);
    vi.mocked(loader.__qrl.getHash).mockClear();

    prefetchLoaderData(loadedRoute, new URL('http://localhost/next/'), manifestHash);

    expect(loader.__qrl.getHash).toHaveBeenCalled();
    expect(fetchedIds()).toEqual(['a']);
  });
});
