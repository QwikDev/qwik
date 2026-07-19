import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, Slot, component$, useContextProvider, useStore, type RenderRoot } from '@qwik.dev/core';
import { createDOM, trigger } from '@qwik.dev/core/testing';
import { DocumentHeadContext, RouteLocationContext, RouteNavigateContext } from './contexts';
import { createDocumentHead } from './head';
import { Link, type PrefetchStrategy } from './link-component';

const { prefetchRouteMock, getClientNavPathMock } = vi.hoisted(() => ({
  prefetchRouteMock: vi.fn(),
  getClientNavPathMock: vi.fn(),
}));

vi.mock('./prefetch-route', () => ({
  prefetchRoute: prefetchRouteMock,
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
const renderCleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of renderCleanups.splice(0)) {
    cleanup();
  }
});

type LinkPrefetchProps = {
  prefetch?: boolean | 'js';
  prefetchBundles?: PrefetchStrategy;
  prefetchData?: PrefetchStrategy;
};

const RouterProvider = component$(() => {
  useContextProvider(DocumentHeadContext, useStore(createDocumentHead, { deep: false }));
  useContextProvider(
    RouteLocationContext,
    useStore(
      {
        url: new URL('http://localhost/'),
        params: {},
        isNavigating: false,
        prevUrl: undefined,
      },
      { deep: false }
    )
  );
  useContextProvider(
    RouteNavigateContext,
    $(() => Promise.resolve())
  );
  return <Slot />;
});

const Root = component$((props: LinkPrefetchProps) => {
  return (
    <RouterProvider>
      <Link
        href="/test"
        prefetch={props.prefetch}
        prefetchBundles={props.prefetchBundles}
        prefetchData={props.prefetchData}
      >
        Test Link
      </Link>
    </RouterProvider>
  );
});

const DeprecatedRoot = component$(() => {
  return (
    <RouterProvider>
      <Link href="/test" prefetch={false} prefetchBundles="visible" prefetchData="visible">
        Test Link
      </Link>
    </RouterProvider>
  );
});

const ClickRoot = component$(() => {
  return (
    <RouterProvider>
      <Link href="/test">Test Link</Link>
    </RouterProvider>
  );
});

const renderRoot = async <Props,>(root: RenderRoot<Props>, props?: Props) => {
  const harness = await createDOM();
  renderCleanups.push(harness.cleanup);
  return harness.render(root, { debug, props });
};

const renderLink = async (props: LinkPrefetchProps = {}) => {
  const result = await renderRoot(Root, props);
  const { document } = result;
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

describe('link component', () => {
  beforeEach(() => {
    getClientNavPathMock.mockClear();
    getClientNavPathMock.mockReturnValue('http://localhost/test');
    prefetchRouteMock.mockClear();
  });

  it('prefetches bundles by default and prefetches route data on intent by default', async () => {
    const { document, anchor } = await renderLink();

    expect(anchor?.getAttribute('href')).toBe('http://localhost/test');
    expect(anchor?.getAttribute('data-q-prefetch')).toBe('b');
    expect(prefetchRouteMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerenter');

    expect(prefetchRouteMock).toHaveBeenCalledTimes(1);
    expectPrefetchRouteCall(0, '/test', true, 0.8, 'dev', false);
  });

  it('prefetches route data on intent', async () => {
    const { document, anchor } = await renderLink({ prefetchData: 'intent' });
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
    const { document, anchor } = await renderLink({ prefetchData: 'commit' });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');
    await trigger(document.body, anchor, 'keydown', { key: 'Space' });
    expect(prefetchRouteMock).not.toHaveBeenCalled();

    const expectTriggerAwaitsPrefetch = async (
      expectedCalls: number,
      type: string,
      payload?: Record<string, unknown>
    ) => {
      let resolvePrefetch!: () => void;
      prefetchRouteMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolvePrefetch = resolve;
        })
      );
      let didPrefetchSettle = false;
      const pendingPrefetch = trigger(document.body, anchor, type, payload).then(() => {
        didPrefetchSettle = true;
      });
      await vi.waitFor(() => expect(prefetchRouteMock).toHaveBeenCalledTimes(expectedCalls));
      expect(didPrefetchSettle).toBe(false);
      resolvePrefetch();
      await pendingPrefetch;
    };

    await expectTriggerAwaitsPrefetch(1, 'pointerdown');
    await expectTriggerAwaitsPrefetch(2, 'keydown', { key: 'Enter' });

    expect(prefetchRouteMock).toHaveBeenCalledTimes(2);
    expectPrefetchRouteCall(0, '/test', true, 0.8, 'dev', false);
    expectPrefetchRouteCall(1, '/test', true, 0.8, 'dev', false);
  });

  it('prefetches route data when visible strategy is enabled', async () => {
    const { anchor } = await renderLink({
      prefetchBundles: 'off',
      prefetchData: 'visible',
    });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('d');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles when visible strategy is enabled', async () => {
    const { anchor } = await renderLink({
      prefetchBundles: 'visible',
      prefetchData: 'off',
    });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('b');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles and route data when visible strategy is enabled for both', async () => {
    const { anchor } = await renderLink({
      prefetchBundles: 'visible',
      prefetchData: 'visible',
    });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('bd');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles when deprecated prefetch is js', async () => {
    const { anchor } = await renderLink({ prefetch: 'js' });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('b');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles and route data when deprecated prefetch is true', async () => {
    const { anchor } = await renderLink({ prefetch: true });

    expect(anchor.getAttribute('data-q-prefetch')).toBe('bd');
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('does not prefetch route data when data prefetching is off', async () => {
    const { document, anchor } = await renderLink({ prefetchData: 'off' });
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');
    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });

    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('does not prefetch route data or bundles when deprecated prefetch is false', async () => {
    const result = await renderRoot(DeprecatedRoot);
    const { document } = result;
    const anchor = document.querySelector('a');

    expect(anchor?.hasAttribute('data-q-prefetch')).toBe(false);
    expect(prefetchRouteMock).not.toHaveBeenCalled();
  });

  it('preloads route bundles on click before navigation', async () => {
    const result = await renderRoot(ClickRoot);
    const { document } = result;
    const anchor = document.querySelector('a');
    prefetchRouteMock.mockClear();

    await trigger(document.body, anchor!, 'click');

    expect(prefetchRouteMock).toHaveBeenCalledTimes(1);
    expectPrefetchRouteCall(0, '/test', false, 1);
  });
});
