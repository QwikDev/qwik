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
      { tagName: 'link', attrs: { rel: 'modulepreload', href: '/preloader.js' } },
      {
        tagName: 'link',
        attrs: {
          rel: 'preload',
          href: '/assets/bundle-graph.json',
          as: 'fetch',
          crossorigin: 'anonymous',
        },
      },
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

  it.each([0, 1, 25])('passes a speculative preload limit of %s to the client', async (limit) => {
    const { container, getScriptContent } = createContainer();
    const { preloaderPre } = await import('./preload-impl');

    preloaderPre(container, { maxIdlePreloads: limit });

    expect(getScriptContent()).toContain(`{P:${limit}}`);
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

  it('links what the client preloader would fetch first, not the first bundles in render order', async () => {
    const { initPreloader } = await import('../core/preloader/bundle-graph');
    const { includePreloader } = await import('./preload-impl');
    // a.js only holds a component and b.js holds a handler, so the client fetches b.js first.
    initPreloader(['a.js', -4, 'b.js', -2]);
    const { container, getScriptContent } = createContainer();

    includePreloader(container, { ssrPreloads: 1 }, ['a.js', 'b.js']);

    const [linksScript, afterLoad] = getScriptContent().split(`window.addEventListener('load'`);
    expect(linksScript).toContain('["b.js"].map(');
    expect(afterLoad).toContain('p(["a.js","b.js"])');
  });

  it('keeps equally likely bundles in render order', async () => {
    const { initPreloader } = await import('../core/preloader/bundle-graph');
    const { getPreloadOrder } = await import('../core/preloader/queue');
    // a.js, b.js and c.js each import core.js and their own dep.
    initPreloader([
      'core.js',
      'a.js',
      0,
      10,
      'b.js',
      0,
      11,
      'c.js',
      0,
      12,
      'a-dep.js',
      'b-dep.js',
      'c-dep.js',
    ]);

    expect(getPreloadOrder(['a.js', 'b.js', 'c.js'])).toEqual([
      'a.js',
      'core.js',
      'a-dep.js',
      'b.js',
      'b-dep.js',
      'c.js',
      'c-dep.js',
    ]);
  });

  it("ranks each render's hint afresh, since SSR shares the preloader's state", async () => {
    const { initPreloader } = await import('../core/preloader/bundle-graph');
    const { getPreloadOrder } = await import('../core/preloader/queue');
    initPreloader(['a.js', 4, 'b.js', 4, 'shared.js']);

    expect(new Set(getPreloadOrder(['a.js']))).toEqual(new Set(['a.js', 'shared.js']));
    expect(new Set(getPreloadOrder(['b.js']))).toEqual(new Set(['b.js', 'shared.js']));
    // The same page again: its import edges must not remember the first render's probabilities.
    expect(new Set(getPreloadOrder(['a.js']))).toEqual(new Set(['a.js', 'shared.js']));
  });
});
