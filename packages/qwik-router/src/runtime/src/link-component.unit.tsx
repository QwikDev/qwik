import { beforeEach, describe, expect, it, vi } from 'vitest';
import { component$ } from '@qwik.dev/core';
import { QwikRouterMockProvider } from '@qwik.dev/router';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { Link, type PrefetchStrategy } from './link-component';

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

type LinkPrefetchProps = {
  prefetch?: boolean | 'js';
  prefetchBundle?: PrefetchStrategy;
  prefetchData?: PrefetchStrategy;
};

const Root = component$((props: LinkPrefetchProps) => {
  return (
    <QwikRouterMockProvider>
      <Link
        href="/test"
        prefetch={props.prefetch}
        prefetchBundle={props.prefetchBundle}
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
  if (render === ssrRenderToDom) {
    await trigger(document.body, 'a', 'qvisible');
  }
  const anchor = document.querySelector('a');
  expect(anchor).not.toBeNull();
  return { document, anchor: anchor! };
};

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: link component', ({ render }) => {
  beforeEach(() => {
    getClientNavPathMock.mockClear();
    getClientNavPathMock.mockReturnValue('http://localhost/test');
    loadClientDataMock.mockClear();
    preloadRouteBundlesMock.mockClear();
  });

  it('show render Link component with default prefetch strategy', async () => {
    const { anchor } = await renderLink(render);

    expect(anchor?.getAttribute('href')).toBe('http://localhost/test');
    expect(loadClientDataMock).not.toHaveBeenCalled();
    expect(preloadRouteBundlesMock).not.toHaveBeenCalled();
  });

  it('prefetches route data on intent', async () => {
    const { document, anchor } = await renderLink(render, { prefetchData: 'intent' });

    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });
    expect(loadClientDataMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');

    expect(loadClientDataMock).toHaveBeenCalledTimes(2);
    expect(loadClientDataMock).toHaveBeenCalledWith(expect.any(URL), {
      preloadRouteBundles: false,
      isPrefetch: true,
    });
    expect(loadClientDataMock.mock.calls[0][0].pathname).toBe('/test');
    expect(loadClientDataMock.mock.calls[1][0].pathname).toBe('/test');
  });

  it('prefetches route data on commit', async () => {
    const { document, anchor } = await renderLink(render, { prefetchData: 'commit' });

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');
    await trigger(document.body, anchor, 'keydown', { key: 'Space' });
    expect(loadClientDataMock).not.toHaveBeenCalled();

    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });

    expect(loadClientDataMock).toHaveBeenCalledTimes(2);
    expect(loadClientDataMock.mock.calls[0][0].pathname).toBe('/test');
    expect(loadClientDataMock.mock.calls[1][0].pathname).toBe('/test');
  });

  it('prefetches route data when visible strategy is enabled', async () => {
    await renderLink(render, { prefetchData: 'visible' });

    expect(loadClientDataMock).toHaveBeenCalledTimes(1);
    expect(loadClientDataMock).toHaveBeenCalledWith(expect.any(URL), {
      preloadRouteBundles: false,
      isPrefetch: true,
    });
    expect(loadClientDataMock.mock.calls[0][0].pathname).toBe('/test');
    expect(preloadRouteBundlesMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles when visible strategy is enabled', async () => {
    await renderLink(render, { prefetchBundle: 'visible' });

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(preloadRouteBundlesMock).toHaveBeenCalledWith('/test');
    expect(loadClientDataMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles and route data when visible strategy is enabled for both', async () => {
    await renderLink(render, { prefetchBundle: 'visible', prefetchData: 'visible' });

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(preloadRouteBundlesMock).toHaveBeenCalledWith('/test');
    expect(loadClientDataMock).toHaveBeenCalledTimes(1);
    expect(loadClientDataMock.mock.calls[0][0].pathname).toBe('/test');
  });

  it('prefetches bundles when deprecated prefetch is js', async () => {
    await renderLink(render, { prefetch: 'js' });

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(preloadRouteBundlesMock).toHaveBeenCalledWith('/test');
    expect(loadClientDataMock).not.toHaveBeenCalled();
  });

  it('prefetches bundles and route data when deprecated prefetch is true', async () => {
    await renderLink(render, { prefetch: true });

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(preloadRouteBundlesMock).toHaveBeenCalledWith('/test');
    expect(loadClientDataMock).toHaveBeenCalledTimes(1);
    expect(loadClientDataMock).toHaveBeenCalledWith(expect.any(URL), {
      preloadRouteBundles: false,
      isPrefetch: true,
    });
    expect(loadClientDataMock.mock.calls[0][0].pathname).toBe('/test');
  });

  it('does not prefetch route data when data prefetching is off', async () => {
    const { document, anchor } = await renderLink(render, { prefetchData: 'off' });

    await trigger(document.body, anchor, 'pointerenter');
    await trigger(document.body, anchor, 'focus');
    await trigger(document.body, anchor, 'pointerdown');
    await trigger(document.body, anchor, 'keydown', { key: 'Enter' });

    expect(loadClientDataMock).not.toHaveBeenCalled();
  });

  it('does not prefetch route data or bundles when deprecated prefetch is false', async () => {
    const DeprecatedRoot = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link href="/test" prefetch={false} prefetchBundle="visible" prefetchData="visible">
            Test Link
          </Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<DeprecatedRoot />, {
      debug,
    });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'a', 'qvisible');
    }

    expect(loadClientDataMock).not.toHaveBeenCalled();
    expect(preloadRouteBundlesMock).not.toHaveBeenCalled();
  });

  it('preloads route bundles on click before navigation', async () => {
    const ClickRoot = component$(() => {
      return (
        <QwikRouterMockProvider>
          <Link href="/test">Test Link</Link>
        </QwikRouterMockProvider>
      );
    });
    const { document } = await render(<ClickRoot />, {
      debug,
    });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'a', 'qvisible');
    }
    const anchor = document.querySelector('a');

    await trigger(document.body, anchor, 'click');

    expect(preloadRouteBundlesMock).toHaveBeenCalledTimes(1);
    expect(preloadRouteBundlesMock).toHaveBeenCalledWith('/test', 1);
  });
});
