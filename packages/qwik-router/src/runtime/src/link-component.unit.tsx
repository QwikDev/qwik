import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { component$ } from '@qwik.dev/core';
import { QwikRouterMockProvider } from '@qwik.dev/router';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { Link, type LinkProps } from './link-component';

const { loadClientDataMock, preloadRouteBundlesMock, getClientNavPathMock } = vi.hoisted(() => ({
  loadClientDataMock: vi.fn(),
  preloadRouteBundlesMock: vi.fn(),
  getClientNavPathMock: vi.fn(),
}));

vi.mock('./use-endpoint', () => ({
  loadClientData: loadClientDataMock,
}));

vi.mock('./client-navigate', () => ({
  preloadRouteBundles: preloadRouteBundlesMock,
}));

vi.mock('./utils.ts', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  return {
    ...mod,
    getClientNavPath: getClientNavPathMock.mockReturnValue('http://localhost/test'),
  };
});

const debug = false; //true;
Error.stackTraceLimit = 100;

const originalWindow = (globalThis as any).window;
const originalMatchMedia = (globalThis as any).matchMedia;
const createMatchMedia = () => (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

const setPointerType = (isCoarsePointer: boolean) => {
  const baseMatchMedia = createMatchMedia();
  const matchMedia = (query: string) => ({
    ...baseMatchMedia(query),
    matches: query === '(pointer: coarse)' ? isCoarsePointer : false,
  });

  (globalThis as any).window = {
    ...(originalWindow || {}),
    matchMedia,
  };
  (globalThis as any).matchMedia = matchMedia;
};

describe('link prefetch behavior', () => {
  afterEach(() => {
    delete (globalThis as any).__LINK_DATA_PREFETCH_STRATEGY__;
  });

  it('falls back to the default strategies when no global options are configured', async () => {
    vi.resetModules();
    const { getLinkDataPrefetchStrategy } = await import('./link-component');

    expect(getLinkDataPrefetchStrategy(true)).toEqual(['viewport']);
    expect(getLinkDataPrefetchStrategy(false)).toEqual(['hover']);
  });

  it('resolves coarse pointer strategies from the configured global options', async () => {
    globalThis.__LINK_DATA_PREFETCH_STRATEGY__ = {
      coarsePointer: ['pointerdown', 'focus'],
      finePointer: ['hover'],
    };

    vi.resetModules();
    const { getLinkDataPrefetchStrategy } = await import('./link-component');
    const strategy = getLinkDataPrefetchStrategy(true);

    expect(strategy).toEqual(['pointerdown', 'focus']);
  });

  it('resolves fine pointer strategies from the configured global options', async () => {
    globalThis.__LINK_DATA_PREFETCH_STRATEGY__ = {
      coarsePointer: ['viewport'],
      finePointer: ['hover', 'pointerdown', 'focus'],
    };

    vi.resetModules();
    const { getLinkDataPrefetchStrategy } = await import('./link-component');
    const strategy = getLinkDataPrefetchStrategy(false);

    expect(strategy).toEqual(['hover', 'pointerdown', 'focus']);
  });

  it('prefers the coarse pointer strategy provided on the link', async () => {
    globalThis.__LINK_DATA_PREFETCH_STRATEGY__ = {
      coarsePointer: ['viewport'],
      finePointer: ['hover'],
    };

    vi.resetModules();
    const { getLinkDataPrefetchStrategy } = await import('./link-component');
    const strategy = getLinkDataPrefetchStrategy(true, {
      coarsePointer: ['pointerdown', 'focus'],
      finePointer: ['hover'],
    });

    expect(strategy).toEqual(['pointerdown', 'focus']);
  });

  it('prefers the fine pointer strategy provided on the link', async () => {
    globalThis.__LINK_DATA_PREFETCH_STRATEGY__ = {
      coarsePointer: ['viewport'],
      finePointer: ['pointerdown'],
    };

    vi.resetModules();
    const { getLinkDataPrefetchStrategy } = await import('./link-component');
    const strategy = getLinkDataPrefetchStrategy(false, {
      coarsePointer: ['focus'],
      finePointer: ['hover', 'focus'],
    });

    expect(strategy).toEqual(['hover', 'focus']);
  });

  it('falls back to the configured global strategy when a link overrides only the other pointer type', async () => {
    globalThis.__LINK_DATA_PREFETCH_STRATEGY__ = {
      coarsePointer: ['viewport', 'focus'],
      finePointer: ['hover', 'pointerdown'],
    };

    vi.resetModules();
    const { getLinkDataPrefetchStrategy } = await import('./link-component');

    expect(
      getLinkDataPrefetchStrategy(true, {
        finePointer: ['hover', 'focus'],
      })
    ).toEqual(['viewport', 'focus']);
    expect(
      getLinkDataPrefetchStrategy(false, {
        coarsePointer: ['pointerdown'],
      })
    ).toEqual(['hover', 'pointerdown']);
  });
});

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: link component', ({ render }) => {
  beforeEach(() => {
    setPointerType(false);
    loadClientDataMock.mockClear();
    preloadRouteBundlesMock.mockClear();
  });

  afterEach(() => {
    if (typeof originalWindow === 'undefined') {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
    if (typeof originalMatchMedia === 'undefined') {
      delete (globalThis as any).matchMedia;
    } else {
      (globalThis as any).matchMedia = originalMatchMedia;
    }
  });

  it('show render Link component with default prefetch strategy', async () => {
    const Root = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link href="/test">Test Link</Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<Root />, {
      debug,
    });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'a', 'qvisible');
    }
    const anchor = document.querySelector('a');

    expect(anchor).toBeDefined();
    expect(anchor?.getAttribute('href')).toBe('http://localhost/test');
  });

  it('prefetches route data on hover for fine pointers by default', async () => {
    const Root = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link href="/test">Test Link</Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<Root />, {
      debug,
    });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'a', 'qvisible');
    }
    const anchor = document.querySelector('a');

    await trigger(document.body, anchor, 'focus');
    await trigger(document.body, anchor, 'pointerdown');
    expect(loadClientDataMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'mouseover');

    expect(loadClientDataMock).toHaveBeenCalledTimes(1);
    expect(loadClientDataMock).toHaveBeenCalledWith(expect.any(URL), {
      preloadRouteBundles: false,
      isPrefetch: true,
    });
    expect(loadClientDataMock.mock.calls[0][0].pathname).toBe('/test');
  });

  it('prefetches route data on focus when configured for fine pointers', async () => {
    const prefetchDataStrategy: LinkProps['prefetchDataStrategy'] = {
      finePointer: ['focus'],
    };
    const Root = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link href="/test" prefetchDataStrategy={prefetchDataStrategy}>
            Test Link
          </Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<Root />, {
      debug,
    });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'a', 'qvisible');
    }
    const anchor = document.querySelector('a');

    await trigger(document.body, anchor, 'mouseover');
    await trigger(document.body, anchor, 'pointerdown');
    expect(loadClientDataMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'focus');

    expect(loadClientDataMock).toHaveBeenCalledTimes(1);
    expect(loadClientDataMock.mock.calls[0][0].pathname).toBe('/test');
  });

  it('prefetches route data on pointerdown and focus when configured for coarse pointers', async () => {
    setPointerType(true);
    const prefetchDataStrategy: LinkProps['prefetchDataStrategy'] = {
      coarsePointer: ['pointerdown', 'focus'],
      finePointer: ['hover'],
    };
    const Root = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link href="/test" prefetchDataStrategy={prefetchDataStrategy}>
            Test Link
          </Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<Root />, {
      debug,
    });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'a', 'qvisible');
    }
    const anchor = document.querySelector('a');

    await trigger(document.body, anchor, 'mouseover');
    expect(loadClientDataMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'focus');

    expect(loadClientDataMock).toHaveBeenCalledTimes(2);
    expect(loadClientDataMock.mock.calls[0][0].pathname).toBe('/test');
    expect(loadClientDataMock.mock.calls[1][0].pathname).toBe('/test');
  });

  it('keeps bundle preloading on hover when route data prefetch waits for focus', async () => {
    const prefetchDataStrategy: LinkProps['prefetchDataStrategy'] = {
      finePointer: ['focus'],
    };
    const Root = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link href="/test" prefetchDataStrategy={prefetchDataStrategy}>
            Test Link
          </Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<Root />, {
      debug,
    });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'a', 'qvisible');
    }
    const anchor = document.querySelector('a');

    await trigger(document.body, anchor, 'mouseover');

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(preloadRouteBundlesMock).toHaveBeenCalledWith('/test');
    expect(loadClientDataMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles and route data on render when viewport strategy is enabled', async () => {
    const prefetchDataStrategy: LinkProps['prefetchDataStrategy'] = {
      finePointer: ['viewport'],
    };
    const Root = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link href="/test" prefetchDataStrategy={prefetchDataStrategy}>
            Test Link
          </Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<Root />, {
      debug,
    });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'a', 'qvisible');
    }

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(preloadRouteBundlesMock).toHaveBeenCalledWith('/test');
    expect(loadClientDataMock).toHaveBeenCalledTimes(1);
    expect(loadClientDataMock).toHaveBeenCalledWith(expect.any(URL), {
      preloadRouteBundles: false,
      isPrefetch: true,
    });
    expect(loadClientDataMock.mock.calls[0][0].pathname).toBe('/test');
  });
});
