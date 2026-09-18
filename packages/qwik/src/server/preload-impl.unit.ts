import { afterEach, describe, expect, it, vi } from 'vitest';

const createContainer = () => {
  const elements: { tagName: string; attrs: Record<string, string> }[] = [];
  let scriptContent = '';

  const container = {
    $buildBase$: '/',
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
    writeScript(_attrs: Record<string, string>, body = '') {
      scriptContent += body;
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

  it('emits no speculative preload links before page load by default', async () => {
    const { container, getScriptContent } = createContainer();
    const { includePreloader } = await import('./preload-impl');
    const bundles = Array.from({ length: 6 }, (_, index) => `route-${index + 1}.js`);

    includePreloader(container, undefined, bundles);

    const immediateScript = getScriptContent().split(`window.addEventListener('load'`)[0];
    expect(immediateScript).toBe('');
  });

  it('emits speculative preload links when ssrPreloads is opted into', async () => {
    const { container, getScriptContent } = createContainer();
    const { includePreloader } = await import('./preload-impl');
    const bundles = Array.from({ length: 6 }, (_, index) => `route-${index + 1}.js`);

    includePreloader(container, { ssrPreloads: 2 }, bundles);

    const immediateScript = getScriptContent().split(`window.addEventListener('load'`)[0];
    expect(immediateScript).toContain('route-2.js');
    expect(immediateScript).not.toContain('route-3.js');
  });
});
