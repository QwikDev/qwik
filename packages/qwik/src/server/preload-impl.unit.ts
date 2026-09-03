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

const expectDeferredUntilAfterPaint = (
  script: string,
  shouldFetch: boolean,
  supportsIdleCallback = true
) => {
  const fetch = vi.fn();
  const importModule = vi.fn(() => Promise.resolve({ l: vi.fn(), p: vi.fn() }));
  const idleCallbacks: (() => void)[] = [];
  const requestIdleCallback = vi.fn((callback: () => void) => {
    idleCallbacks.push(callback);
  });
  const timers: (() => void)[] = [];
  const setTimeout = vi.fn((callback: () => void) => {
    timers.push(callback);
  });
  const animationFrames: (() => void)[] = [];
  const requestAnimationFrame = vi.fn((callback: () => void) => {
    animationFrames.push(callback);
  });
  let onLoad: (() => void) | undefined;
  const window = {
    addEventListener: vi.fn((event: string, callback: () => void) => {
      if (event === 'load') {
        onLoad = callback;
      }
    }),
  };
  // eslint-disable-next-line no-new-func
  const runScript = new Function(
    'window',
    'requestAnimationFrame',
    'requestIdleCallback',
    'setTimeout',
    'fetch',
    'importModule',
    script.replaceAll('import(', 'importModule(')
  );

  runScript(
    window,
    requestAnimationFrame,
    supportsIdleCallback ? requestIdleCallback : undefined,
    setTimeout,
    fetch,
    importModule
  );

  expect(fetch).not.toHaveBeenCalled();
  expect(importModule).not.toHaveBeenCalled();
  expect(onLoad).toBeTypeOf('function');

  onLoad!();

  expect(requestAnimationFrame).toHaveBeenCalledOnce();
  expect(requestIdleCallback).not.toHaveBeenCalled();
  animationFrames.shift()!();

  expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  expect(requestIdleCallback).not.toHaveBeenCalled();
  animationFrames.shift()!();

  if (supportsIdleCallback) {
    expect(requestIdleCallback).toHaveBeenCalledOnce();
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 1000 });
    expect(setTimeout).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(importModule).not.toHaveBeenCalled();
    idleCallbacks.shift()!();
  } else {
    expect(animationFrames).toHaveLength(1);
    animationFrames.shift()!();
    expect(setTimeout).toHaveBeenCalledOnce();
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function));
    timers.shift()!();
  }

  expect(importModule).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(shouldFetch ? 1 : 0);
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

  it('starts the preloader after page paint during idle time', async () => {
    const { container, elements, getScriptContent } = createContainer();
    const { preloaderPre } = await import('./preload-impl');

    preloaderPre(container, { maxIdlePreloads: 1 });

    expect(elements).toEqual([
      {
        tagName: 'link',
        attrs: {
          rel: 'modulepreload',
          href: '/core.js',
        },
      },
    ]);

    expectDeferredUntilAfterPaint(getScriptContent(), true);
  });

  it('falls back to the next paint without a fixed delay', async () => {
    const { container, getScriptContent } = createContainer();
    const { preloaderPre } = await import('./preload-impl');

    preloaderPre(container, {});

    expectDeferredUntilAfterPaint(getScriptContent(), true, false);
  });

  it('starts speculative bundle preloads after page paint during idle time', async () => {
    const { container, elements, getScriptContent } = createContainer();
    const { includePreloader } = await import('./preload-impl');

    includePreloader(container, { ssrPreloads: 0 }, ['route.js']);

    expect(elements).toEqual([]);
    expectDeferredUntilAfterPaint(getScriptContent(), false);
  });

  it('emits five speculative preload links by default', async () => {
    const { container, getScriptContent } = createContainer();
    const { includePreloader } = await import('./preload-impl');
    const bundles = Array.from({ length: 6 }, (_, index) => `route-${index + 1}.js`);

    includePreloader(container, undefined, bundles);

    const immediateScript = getScriptContent().split(`window.addEventListener('load'`)[0];
    expect(immediateScript).toContain('route-5.js');
    expect(immediateScript).not.toContain('route-6.js');
  });
});
