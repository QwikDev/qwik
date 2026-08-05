import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLinkPrefetchObserver, resetLinkPrefetchState } from './link-prefetch';

const { prefetchRouteMock, preloadRouteBundlesMock } = vi.hoisted(() => ({
  prefetchRouteMock: vi.fn(),
  preloadRouteBundlesMock: vi.fn(),
}));

vi.mock('./prefetch-route', () => ({
  prefetchRoute: prefetchRouteMock,
}));

vi.mock('./client-navigate', () => ({
  preloadRouteBundles: preloadRouteBundlesMock,
}));

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly callback: IntersectionObserverCallback;
  readonly observed: Element[] = [];
  readonly unobserve = vi.fn((element: Element) => {
    const index = this.observed.indexOf(element);
    if (index !== -1) {
      this.observed.splice(index, 1);
    }
  });
  readonly disconnect = vi.fn(() => {
    this.observed.length = 0;
  });

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  trigger(element: Element, isIntersecting = true) {
    this.callback([{ target: element, isIntersecting } as IntersectionObserverEntry], this as any);
  }
}

const createAnchor = (href: string, mode: string) => {
  const anchor = document.createElement('a') as HTMLAnchorElement;
  anchor.setAttribute('q:link', '');
  anchor.setAttribute('data-q-prefetch', mode);
  anchor.setAttribute('href', href);
  anchor.href = href;
  document.body.appendChild(anchor);
  return anchor;
};

const manifestHash = 'test-manifest';
const loaderState = {} as import('./route-loaders').RouteLoaderState;

const createObserver = () => createLinkPrefetchObserver(manifestHash, loaderState);

const expectPrefetchRouteCall = (
  callIndex: number,
  pathname: string,
  ...expectedArgs: unknown[]
) => {
  const [url, ...args] = prefetchRouteMock.mock.calls[callIndex];
  expect(url).toBeInstanceOf(URL);
  expect((url as URL).pathname).toBe(pathname);
  expect(args).toEqual(expectedArgs);
};

describe('link prefetch observer', () => {
  beforeEach(() => {
    const document = createDocument();
    vi.stubGlobal('document', document);
    vi.stubGlobal('location', { href: 'http://localhost/current/' });
    vi.stubGlobal('navigator', { connection: { saveData: false } });
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    MockIntersectionObserver.instances = [];
    resetLinkPrefetchState();
    prefetchRouteMock.mockClear();
    preloadRouteBundlesMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefetches route bundles and visible route data according to the mode', () => {
    const anchor = createAnchor('http://localhost/next/', 'bd');

    const cleanup = createObserver();
    const observer = MockIntersectionObserver.instances[0];
    observer.trigger(anchor);

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(preloadRouteBundlesMock).toHaveBeenCalledWith('/next/');
    expect(prefetchRouteMock).toHaveBeenCalledTimes(1);
    expectPrefetchRouteCall(0, '/next/', true, 0.8, manifestHash, false, loaderState);
    cleanup();
  });

  it('does not prefetch the same anchor twice before reset', () => {
    const anchor = createAnchor('http://localhost/next/', 'b');

    const cleanup = createObserver();
    const observer = MockIntersectionObserver.instances[0];
    observer.trigger(anchor);
    observer.trigger(anchor);

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(observer.unobserve).toHaveBeenCalledWith(anchor);
    cleanup();
  });

  it('allows the same anchor to prefetch again after reset', () => {
    const anchor = createAnchor('http://localhost/next/', 'b');

    const cleanup = createObserver();
    MockIntersectionObserver.instances[0].trigger(anchor);
    cleanup();

    resetLinkPrefetchState();
    const cleanupAfterReset = createObserver();
    MockIntersectionObserver.instances[1].trigger(anchor);

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(2);
    cleanupAfterReset();
  });

  it('disconnects the observer on cleanup', () => {
    createAnchor('http://localhost/next/', 'b');

    const cleanup = createObserver();
    const observer = MockIntersectionObserver.instances[0];
    cleanup();

    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  it('skips current path, cross-origin links, and data saver mode', () => {
    const current = createAnchor('http://localhost/current/?q=1', 'bd');
    const crossOrigin = createAnchor('https://example.com/next/', 'bd');

    const cleanup = createObserver();
    const observer = MockIntersectionObserver.instances[0];
    observer.trigger(current);
    observer.trigger(crossOrigin);

    vi.stubGlobal('navigator', { connection: { saveData: true } });
    const saveData = createAnchor('http://localhost/save-data/', 'bd');
    const cleanupSaveData = createObserver();
    MockIntersectionObserver.instances[1].trigger(saveData);

    expect(preloadRouteBundlesMock).not.toHaveBeenCalled();
    expect(prefetchRouteMock).not.toHaveBeenCalled();
    cleanup();
    cleanupSaveData();
  });
});
