import { beforeEach, describe, expect, it, vi } from 'vitest';
import { $, component$ } from '@qwik.dev/core';
import { QwikRouterMockProvider } from '@qwik.dev/router';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { Link, type PrefetchStrategy } from './link-component';

const { prefetchRouteMock, preloadRouteBundlesMock, getClientNavPathMock, gotoMock } = vi.hoisted(
  () => ({
    prefetchRouteMock: vi.fn(),
    preloadRouteBundlesMock: vi.fn(),
    getClientNavPathMock: vi.fn(),
    gotoMock: vi.fn(),
  })
);

vi.mock('./prefetch-route', () => ({
  prefetchRoute: prefetchRouteMock,
}));

vi.mock('./client-navigate', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  preloadRouteBundles: preloadRouteBundlesMock,
}));

const page = () => Promise.resolve({});
vi.mock('./router-config', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  findRouterConfig: () => ({
    routes: {
      test: { _I: page },
      product: { _W: { _P: 'id', _I: page } },
      docs: { _L: Object.assign(() => Promise.resolve({}), { _K: 'DocsLayout' }), _I: page },
    },
  }),
}));

vi.mock('./utils.ts', async (importOriginal) => {
  const mod = (await importOriginal()) as any;
  return {
    ...mod,
    getClientNavPath: getClientNavPathMock.mockReturnValue('http://localhost/test'),
  };
});

const onPointerEnterMock = vi.fn();
const onMouseOverMock = vi.fn();

const debug = false; //true;
Error.stackTraceLimit = 100;

type LinkPrefetchProps = {
  prefetch?: boolean | 'js';
  prefetchBundles?: PrefetchStrategy;
  prefetchData?: PrefetchStrategy;
};

const Root = component$((props: LinkPrefetchProps) => {
  return (
    <QwikRouterMockProvider>
      <Link
        href="/test"
        prefetch={props.prefetch}
        prefetchBundles={props.prefetchBundles}
        prefetchData={props.prefetchData}
      >
        Test Link
      </Link>
    </QwikRouterMockProvider>
  );
});

const renderLink = async (
  render: typeof ssrRenderToDom | typeof domRender,
  props: LinkPrefetchProps = {}
) => {
  const { document } = await render(<Root {...props} />, {
    debug,
  });
  const anchor = document.querySelector('a');
  expect(anchor).not.toBeNull();
  return { document, anchor: anchor! };
};

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

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: link component', ({ render }) => {
  beforeEach(() => {
    getClientNavPathMock.mockClear();
    getClientNavPathMock.mockReturnValue('http://localhost/test');
    prefetchRouteMock.mockClear();
    preloadRouteBundlesMock.mockClear();
    onPointerEnterMock.mockClear();
    onMouseOverMock.mockClear();
  });

  it('prefetches bundles by default and prefetches route data on intent by default', async () => {
    const { document, anchor } = await renderLink(render);

    expect(anchor?.getAttribute('href')).toBe('http://localhost/test');
    expect(anchor?.getAttribute('data-q-prefetch')).toBe('b');
    expect(prefetchRouteMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerenter');

    expect(prefetchRouteMock).toHaveBeenCalledTimes(2);
    expectPrefetchRouteCall(0, '/test', true, 0.8, 'dev', false);
    expectPrefetchRouteCall(1, '/test', false, 0.9);
  });

  it('hints the bundles of a link that prefetches when visible again on intent', async () => {
    const { document, anchor } = await renderLink(render, {
      prefetchBundles: 'visible',
      prefetchData: 'off',
    });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });
    expect(prefetchRouteMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');

    expect(prefetchRouteMock).toHaveBeenCalledTimes(2);
    expectPrefetchRouteCall(0, '/test', false, 0.9);
    expectPrefetchRouteCall(1, '/test', false, 0.9);
  });

  it('renders the route name of the link target on every client-side link', async () => {
    getClientNavPathMock.mockReturnValue('/product/hoodie-01/');
    const dynamic = await renderLink(render);
    expect(dynamic.anchor.getAttribute('data-q-route')).toBe('/product/[id]');

    const withoutPrefetch = await renderLink(render, { prefetchBundles: 'off' });
    expect(withoutPrefetch.anchor.getAttribute('data-q-route')).toBe('/product/[id]');

    getClientNavPathMock.mockReturnValue('/missing/');
    const unmatched = await renderLink(render);
    expect(unmatched.anchor.hasAttribute('data-q-route')).toBe(false);
  });

  it('renders the layouts the link target needs and this page lacks', async () => {
    getClientNavPathMock.mockReturnValue('/docs/');
    const underAnotherLayout = await renderLink(render);
    expect(underAnotherLayout.anchor.getAttribute('data-q-layouts')).toBe('DocsLayout');

    getClientNavPathMock.mockReturnValue('/product/hoodie-01/');
    const underTheSameLayouts = await renderLink(render);
    expect(underTheSameLayouts.anchor.hasAttribute('data-q-layouts')).toBe(false);
  });

  it('renders a link whose href has a malformed escape, without a route name', async () => {
    getClientNavPathMock.mockReturnValue('/product/100%');
    const { anchor } = await renderLink(render, { prefetchBundles: 'off' });
    expect(anchor.getAttribute('href')).toBe('/product/100%');
    expect(anchor.hasAttribute('data-q-route')).toBe(false);
  });

  it('prefetches route data on intent', async () => {
    const { document, anchor } = await renderLink(render, {
      prefetchBundles: 'off',
      prefetchData: 'intent',
    });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });
    expect(prefetchRouteMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');

    expect(prefetchRouteMock).toHaveBeenCalledTimes(2);
    expectPrefetchRouteCall(0, '/test', true, 0.8, 'dev', false);
    expectPrefetchRouteCall(1, '/test', true, 0.8, 'dev', false);
  });

  it('prefetches route data on commit', async () => {
    const { document, anchor } = await renderLink(render, {
      prefetchBundles: 'off',
      prefetchData: 'commit',
    });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');
    await trigger(document.body, anchor, 'keydown', { key: 'Space' });
    expect(prefetchRouteMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });

    expect(prefetchRouteMock).toHaveBeenCalledTimes(2);
    expectPrefetchRouteCall(0, '/test', true, 0.8, 'dev', false);
    expectPrefetchRouteCall(1, '/test', true, 0.8, 'dev', false);
  });

  it('prefetches route bundles on intent', async () => {
    const { document, anchor } = await renderLink(render, {
      prefetchBundles: 'intent',
      prefetchData: 'off',
    });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });
    expect(prefetchRouteMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');

    expect(prefetchRouteMock).toHaveBeenCalledTimes(2);
    expectPrefetchRouteCall(0, '/test', false, 0.9);
    expectPrefetchRouteCall(1, '/test', false, 0.9);
  });

  it('prefetches route bundles on commit', async () => {
    const { document, anchor } = await renderLink(render, {
      prefetchBundles: 'commit',
      prefetchData: 'off',
    });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');
    await trigger(document.body, anchor, 'keydown', { key: 'Space' });
    expect(prefetchRouteMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });

    expect(prefetchRouteMock).toHaveBeenCalledTimes(2);
    expectPrefetchRouteCall(0, '/test', false, 0.9);
    expectPrefetchRouteCall(1, '/test', false, 0.9);
  });

  it('prefetches route bundles and data on commit', async () => {
    const { document, anchor } = await renderLink(render, {
      prefetchBundles: 'commit',
      prefetchData: 'commit',
    });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });

    expect(prefetchRouteMock).toHaveBeenCalledTimes(4);
    expectPrefetchRouteCall(0, '/test', true, 0.8, 'dev', false);
    expectPrefetchRouteCall(1, '/test', false, 0.9);
    expectPrefetchRouteCall(2, '/test', true, 0.8, 'dev', false);
    expectPrefetchRouteCall(3, '/test', false, 0.9);
  });

  it('prefetches route data when visible strategy is enabled', async () => {
    const { anchor } = await renderLink(render, {
      prefetchBundles: 'off',
      prefetchData: 'visible',
    });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('d');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles when visible strategy is enabled', async () => {
    const { anchor } = await renderLink(render, {
      prefetchBundles: 'visible',
      prefetchData: 'off',
    });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('b');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles and route data when visible strategy is enabled for both', async () => {
    const { anchor } = await renderLink(render, {
      prefetchBundles: 'visible',
      prefetchData: 'visible',
    });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('bd');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles when deprecated prefetch is js', async () => {
    const { anchor } = await renderLink(render, { prefetch: 'js' });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('b');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles and route data when deprecated prefetch is true', async () => {
    const { anchor } = await renderLink(render, { prefetch: true });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('bd');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('does not prefetch route data when data prefetching is off', async () => {
    const { document, anchor } = await renderLink(render, {
      prefetchBundles: 'off',
      prefetchData: 'off',
    });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');
    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });

    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('does not prefetch route bundles when bundle prefetching is off', async () => {
    const { document, anchor } = await renderLink(render, {
      prefetchBundles: 'off',
      prefetchData: 'off',
    });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');
    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });

    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('does not prefetch route data or bundles when deprecated prefetch is false', async () => {
    const DeprecatedRoot = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link href="/test" prefetch={false} prefetchBundles="visible" prefetchData="visible">
            Test Link
          </Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<DeprecatedRoot />, {
      debug,
    });
    const anchor = document.querySelector('a');

    expect(anchor?.hasAttribute('data-q-prefetch')).toBe(false);
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  const ClickRoot = component$(() => {
    return (
      <QwikRouterMockProvider>
        <Link href="/test">Test Link</Link>
      </QwikRouterMockProvider>
    );
  });

  it('hints the target route at the highest priority on click, before the router config loads', async () => {
    const { document } = await render(<ClickRoot />, {
      debug,
    });
    const anchor = document.querySelector('a');
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'click');

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(preloadRouteBundlesMock).toHaveBeenCalledWith('/test', 1);
    expect(prefetchRouteMock).toHaveBeenCalledTimes(1);
    expectPrefetchRouteCall(0, '/test', false, 1);
  });

  it('resolves the route on click when the link has no route name', async () => {
    getClientNavPathMock.mockReturnValue('http://localhost/missing/');
    const { document } = await render(<ClickRoot />, {
      debug,
    });
    const anchor = document.querySelector('a');
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'click');

    expect(prefetchRouteMock).toHaveBeenCalledTimes(1);
    expectPrefetchRouteCall(0, '/missing/', false, 1);
    expect(preloadRouteBundlesMock).not.toHaveBeenCalled();
  });

  describe('navigating state', () => {
    const NavigatingRoot = component$(() => {
      return (
        <QwikRouterMockProvider goto={$(() => gotoMock())}>
          <Link href="/test">Test Link</Link>
        </QwikRouterMockProvider>
      );
    });

    const clickLink = async () => {
      const { document } = await render(<NavigatingRoot />, { debug });
      const anchor = document.querySelector('a')!;
      await trigger(document.body, anchor, 'click');
      return anchor;
    };

    const flushNavigation = () => new Promise((resolve) => setTimeout(resolve));

    it('marks the link with data-navigating until navigation resolves', async () => {
      let resolveNavigation!: () => void;
      gotoMock.mockReturnValue(new Promise<void>((resolve) => (resolveNavigation = resolve)));

      const anchor = await clickLink();

      expect(anchor.hasAttribute('aria-pressed')).toBe(false);
      expect(anchor.hasAttribute('data-navigating')).toBe(true);

      resolveNavigation();
      await flushNavigation();

      expect(anchor.hasAttribute('data-navigating')).toBe(false);
    });

    it('clears data-navigating when navigation rejects, still reporting the error', async () => {
      const offline = new Error('offline');
      let rejectNavigation!: (error: Error) => void;
      gotoMock.mockReturnValue(new Promise<void>((_, reject) => (rejectNavigation = reject)));
      const vitestListeners = process.listeners('unhandledRejection');
      const onUnhandledRejection = vi.fn();
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', onUnhandledRejection);

      try {
        const anchor = await clickLink();

        expect(anchor.hasAttribute('data-navigating')).toBe(true);

        rejectNavigation(offline);
        await flushNavigation();

        expect(anchor.hasAttribute('data-navigating')).toBe(false);
        expect(onUnhandledRejection).toHaveBeenCalledWith(offline, expect.any(Promise));
      } finally {
        process.removeAllListeners('unhandledRejection');
        vitestListeners.forEach((listener) => process.on('unhandledRejection', listener));
      }
    });
  });

  it('calls onPointerEnter$ on pointerenter, not onMouseOver$', async () => {
    const HandlersRoot = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link
            href="/test"
            onPointerEnter$={() => onPointerEnterMock()}
            onMouseOver$={() => onMouseOverMock()}
          >
            Test Link
          </Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<HandlersRoot />, {
      debug,
    });
    const anchor = document.querySelector('a');

    await trigger(document.body, anchor, 'pointerenter');

    expect(onPointerEnterMock).toHaveBeenCalledTimes(1);
    expect(onMouseOverMock).not.toHaveBeenCalled();
  });
});
