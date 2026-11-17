import { afterEach, describe, expect, it, vi } from 'vitest';

const createContainer = (buildBase = '/') => {
  const elements: { tagName: string; attrs: Record<string, string> }[] = [];
  let scriptContent = '';

  const container = {
    $buildBase$: buildBase,
    resolvedManifest: {
      manifest: {
        preloader: 'preloader.js',
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

    expect(elements).toEqual([]);
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

  it('links the first 5 bundles before page load by default', async () => {
    const { container, getScriptContent } = createContainer();
    const { includePreloader } = await import('./preload-impl');
    const bundles = Array.from({ length: 6 }, (_, index) => `route-${index + 1}.js`);

    includePreloader(container, undefined, bundles);

    const immediateScript = getScriptContent().split(`window.addEventListener('load'`)[0];
    expect(immediateScript).toContain('route-5.js');
    expect(immediateScript).not.toContain('route-6.js');
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
    // Both bundles statically import shared.js, so the client rates it above either of them.
    initPreloader(['a.js', 2, 'shared.js', 'b.js', 2]);
    const { container, getScriptContent } = createContainer();

    includePreloader(container, { ssrPreloads: 1 }, ['a.js', 'b.js']);

    const [linksScript, afterLoad] = getScriptContent().split(`window.addEventListener('load'`);
    expect(linksScript).toContain('["shared.js"].map(');
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
      'core.js',
      'a.js',
      'a-dep.js',
      'b.js',
      'b-dep.js',
      'c.js',
      'c-dep.js',
    ]);
  });

  it("links core first for an event, since _run's and the handler's bundles both import it", async () => {
    const { getPlatform, setPlatform } = await import('@qwik.dev/core');
    const { setEvent } = await import('../core/ssr/ssr-events');
    const { createQRL } = await import('../core/shared/qrl/qrl-class');
    const { runQrl } = await import('../core/shared/qrl/handler-qrls');
    const { initPreloader } = await import('../core/preloader/bundle-graph');
    const { preloaderPost } = await import('./preload-impl');
    const runSymbol = runQrl().$symbol$;
    const platform = getPlatform();
    setPlatform({
      ...platform,
      chunkForSymbol: (symbol, chunk) => [symbol, symbol === runSymbol ? 'run.js' : chunk!],
    });
    // Both bundles statically import core.js, so the client rates it above either of them.
    initPreloader(['run.js', 2, 'core.js', 'handler.js', 2]);
    try {
      const { container, getScriptContent } = createContainer();
      Object.assign(container.serializationCtx, {
        $symbolToChunkResolver$: () => 'run.js',
        $addRoot$: () => 0,
        $eventNames$: new Set(),
      });
      setEvent(
        container.serializationCtx,
        'q-e:click',
        createQRL('handler.js', 's_handler', () => {}).m(),
        true
      );
      preloaderPost(container, { preloader: { ssrPreloads: 1 } } as any);

      const [linksScript, afterLoad] = getScriptContent().split(`window.addEventListener('load'`);
      // Render order would link run.js first.
      expect(linksScript).toContain('["core.js"].map(');
      expect(afterLoad).toContain('p(["run.js","handler.js"])');
    } finally {
      setPlatform(platform);
    }
  });

  describe("core's handler bundles linked mid-stream", () => {
    // run.js and task.js statically import glue.js, which imports core.js; run.js loads lazy.js.
    const bundleGraph = [
      'run.js',
      8,
      -9,
      11,
      'task.js',
      8,
      'handler.js',
      10,
      'glue.js',
      10,
      'core.js',
      'lazy.js',
    ];

    const withCoreHandlerBundles = async (
      test: (handlers: { run: unknown; task: unknown }) => Promise<void>
    ) => {
      const { getPlatform, setPlatform } = await import('@qwik.dev/core');
      const { runQrl, taskQrl } = await import('../core/shared/qrl/handler-qrls');
      const bundleOf: Record<string, string> = {
        [runQrl().$symbol$]: 'run.js',
        [taskQrl().$symbol$]: 'task.js',
      };
      const platform = getPlatform();
      setPlatform({
        ...platform,
        chunkForSymbol: (symbol, chunk) => [symbol, bundleOf[symbol] ?? chunk!],
      });
      try {
        await test({ run: runQrl(), task: taskQrl().w([{}]) });
      } finally {
        setPlatform(platform);
      }
    };

    const createContainerUsing = (coreHandlerQrl: unknown, buildBase?: string) => {
      const created = createContainer(buildBase);
      created.container.resolvedManifest.manifest.bundleGraph = bundleGraph;
      created.container.serializationCtx.$coreHandlerQrl$ = coreHandlerQrl;
      return created;
    };

    it("links core, the rest of _run's static imports, then _run's bundle, from a script that removes itself", () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(run, '/build/');

        expect(preloadHandlerBundles(container, { ssrPreloads: 5 })).toBe(true);

        const script = getScriptContent();
        expect(script).toContain('["core.js","glue.js","run.js"].map(');
        expect(script).toContain('"/build/"+l');
        expect(script).not.toContain('lazy.js');
        expect(script).toContain('document.currentScript.remove()');
      }));

    it("links _task's bundle on a page whose only handler is a visible task", () =>
      withCoreHandlerBundles(async ({ task }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(task);

        preloadHandlerBundles(container, { ssrPreloads: 5 });

        expect(getScriptContent()).toContain('["core.js","glue.js","task.js"].map(');
      }));

    it('follows a static import cycle once', () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(run);
        // run.js and a.js import each other; a.js imports core.js.
        container.resolvedManifest.manifest.bundleGraph = ['run.js', 2, 'a.js', 0, 5, 'core.js'];

        preloadHandlerBundles(container, { ssrPreloads: 5 });

        expect(getScriptContent()).toContain('["core.js","a.js","run.js"].map(');
      }));

    it("links nothing early when the handler's bundle isn't in the bundle graph", () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(run);
        container.resolvedManifest.manifest.bundleGraph = ['other.js'];

        expect(preloadHandlerBundles(container, { ssrPreloads: 5 })).toBe(true);
        expect(getScriptContent()).toBe('');
      }));

    it('links only core when ssrPreloads allows one link', () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(run);

        preloadHandlerBundles(container, { ssrPreloads: 1 });

        expect(getScriptContent()).toContain('["core.js"].map(');
      }));

    it("waits until the page's events run through one of core's handlers", () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(null);

        expect(preloadHandlerBundles(container, { ssrPreloads: 5 })).toBe(false);
        expect(getScriptContent()).toBe('');

        container.serializationCtx.$coreHandlerQrl$ = run;
        expect(preloadHandlerBundles(container, { ssrPreloads: 5 })).toBe(true);
        expect(getScriptContent()).toContain('"run.js"');
      }));

    it('links nothing early without ssrPreloads or with the preloader off', () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const disabled = [{ ssrPreloads: 0 }, false] as const;
        for (let i = 0; i < disabled.length; i++) {
          const options = disabled[i];
          const { container, getScriptContent } = createContainerUsing(run);

          expect(preloadHandlerBundles(container, options)).toBe(true);

          expect(getScriptContent()).toBe('');
        }
      }));

    it('leaves those bundles out of the links at the end and counts them', () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { initPreloader } = await import('../core/preloader/bundle-graph');
        const { includePreloader, preloadHandlerBundles } = await import('./preload-impl');
        initPreloader(bundleGraph);
        const { container, getScriptContent } = createContainerUsing(run);

        preloadHandlerBundles(container, { ssrPreloads: 4 });
        const early = getScriptContent();
        includePreloader(container, { ssrPreloads: 4 }, ['run.js', 'handler.js']);

        const [linksAtTheEnd] = getScriptContent()
          .slice(early.length)
          .split(`window.addEventListener('load'`);
        expect(linksAtTheEnd).toContain('["handler.js"].map(');
      }));
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
