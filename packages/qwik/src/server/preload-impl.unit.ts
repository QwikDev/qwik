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
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not emit preloader assets or scripts in dev mode', async () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('TEST', '');

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
});
