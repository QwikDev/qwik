import { afterEach, describe, expect, it, vi } from 'vitest';

const createContainer = (buildBase = '/') => {
  const elements: { tagName: string; attrs: Record<string, string> }[] = [];
  let scriptContent = '';

  const container = {
    $buildBase$: buildBase,
    resolvedManifest: {
      manifest: {
        preloader: 'preloader.js',
        core: 'core.js',
        bundleGraphAsset: 'assets/bundle-graph.json',
        bundleGraph: [],
      },
    },
    serializationCtx: {
      $eventQrls$: new Set(),
    },
    openElement(tagName: string, _key: any, attrs: Record<string, string>) {
      elements.push({ tagName, attrs });
    },
    write(content: string) {
      scriptContent += content;
    },
    closeElement() {},
  };

  return {
    container: container as any,
    elements,
    getScriptContent: () => scriptContent,
  };
};

describe('preloader', () => {
  afterEach(() => {
    vi.doUnmock('./qwik-copy');
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not emit preloader assets or scripts in dev mode', async () => {
    vi.stubEnv('DEV', true);
    vi.doMock('./qwik-copy', () => ({
      initPreloader: vi.fn(),
      qTest: false,
    }));
    vi.resetModules();

    const { container, elements, getScriptContent } = createContainer();
    const { preloaderPost, preloaderPre } = await import('./preload-impl');

    preloaderPre(container, {});
    preloaderPost(container, { preloader: {} } as any);

    expect(elements).toEqual([
      {
        tagName: 'link',
        attrs: {
          rel: 'modulepreload',
          href: '/core.js',
        },
      },
    ]);
    expect(getScriptContent()).toBe('');
  });

  it('preloads the core bundle from the build base in a development build', async () => {
    // `vite build` with a NODE_ENV other than production sets DEV, but still serves from /build/.
    vi.stubEnv('DEV', true);
    vi.stubEnv('BASE_URL', '/');
    vi.doMock('./qwik-copy', () => ({
      initPreloader: vi.fn(),
      qTest: false,
    }));
    vi.resetModules();

    const { container, elements } = createContainer('/build/');
    const { preloaderPre } = await import('./preload-impl');

    preloaderPre(container, {});

    expect(elements).toEqual([
      {
        tagName: 'link',
        attrs: {
          rel: 'modulepreload',
          href: '/build/core.js',
        },
      },
    ]);
  });
});
