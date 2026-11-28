import { runInNewContext } from 'node:vm';
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
      $coreHandlerQrls$: new Map(),
      $eagerPreloads$: new Map(),
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

  it('links no bundle before page load by default', async () => {
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

  it('keeps a build base holding </script> inside its scripts, and in the links it adds', async () => {
    const base = '/a"</script><b>/';
    const { container, getScriptContent } = createContainer(base);
    const { includePreloader, preloaderPre } = await import('./preload-impl');

    preloaderPre(container, {});
    includePreloader(container, { ssrPreloads: 1 }, ['x.js']);

    // Only `</script` ends a script element while the HTML is parsed.
    expect(getScriptContent()).not.toMatch(/<\/script/i);
    const linksScript = getScriptContent().split('window.addEventListener').at(-2)!;
    const hrefs: string[] = [];
    const document = {
      createElement: () => ({}),
      head: { appendChild: (link: { href: string }) => hrefs.push(link.href) },
    };
    runInNewContext(linksScript.slice(linksScript.indexOf('["x.js"]')), { document });
    expect(hrefs).toEqual([`${base}x.js`]);
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

  it("links core first for an event, since the handler's bundle imports it", async () => {
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
    initPreloader(['run.js', -3, 3, 'core.js', 'handler.js', -2, 3]);
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
      -3,
      11,
      -1,
      14,
      'task.js',
      -3,
      11,
      'handler.js',
      -2,
      13,
      'glue.js',
      13,
      'core.js',
      'lazy.js',
      -3,
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

    const use = (container: { serializationCtx: any }, handler: any) =>
      container.serializationCtx.$coreHandlerQrls$.set(handler.$hash$, handler);

    const createContainerUsing = (coreHandlerQrl: unknown, buildBase?: string) => {
      const created = createContainer(buildBase);
      created.container.resolvedManifest.manifest.bundleGraph = bundleGraph;
      if (coreHandlerQrl) {
        use(created.container, coreHandlerQrl);
      }
      return created;
    };

    it("links core, the rest of _run's static imports, then _run's bundle, from a script that removes itself", () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(run, '/build/');

        preloadHandlerBundles(container, undefined);

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

        preloadHandlerBundles(container, undefined);

        expect(getScriptContent()).toContain('["core.js","glue.js","task.js"].map(');
      }));

    it('follows a static import cycle once', () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(run);
        // run.js and a.js import each other; a.js imports core.js.
        container.resolvedManifest.manifest.bundleGraph = [
          'run.js',
          -3,
          3,
          'a.js',
          0,
          6,
          'core.js',
        ];

        preloadHandlerBundles(container, undefined);

        expect(getScriptContent()).toContain('["core.js","a.js","run.js"].map(');
      }));

    it("links nothing early when the handler's bundle isn't in the bundle graph", () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(run);
        container.resolvedManifest.manifest.bundleGraph = ['other.js'];

        preloadHandlerBundles(container, undefined);

        expect(getScriptContent()).toBe('');
      }));

    it("waits until the page's events run through one of core's handlers", () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(null);

        preloadHandlerBundles(container, undefined);
        expect(getScriptContent()).toBe('');

        use(container, run);
        preloadHandlerBundles(container, undefined);
        expect(getScriptContent()).toContain('"run.js"');
      }));

    it('links them with ssrPreloads at 0, and nothing with the preloader off', () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const withoutExtraLinks = createContainerUsing(run);
        const preloaderOff = createContainerUsing(run);

        preloadHandlerBundles(withoutExtraLinks.container, { ssrPreloads: 0 });
        preloadHandlerBundles(preloaderOff.container, false);

        expect(withoutExtraLinks.getScriptContent()).toContain(
          '["core.js","glue.js","run.js"].map('
        );
        expect(preloaderOff.getScriptContent()).toBe('');
      }));

    it("links each of core's handlers the page uses, and core only once", () =>
      withCoreHandlerBundles(async ({ run, task }) => {
        const { preloadHandlerBundles } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(run);
        preloadHandlerBundles(container, undefined);
        const linkedForRun = getScriptContent();

        use(container, task);
        preloadHandlerBundles(container, undefined);

        expect(getScriptContent().slice(linkedForRun.length)).toContain('["task.js"].map(');
      }));

    it('links a handler that only appears on the last element, when the stream ends', () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { preloaderPost } = await import('./preload-impl');
        const { container, getScriptContent } = createContainerUsing(run);
        container.serializationCtx.$eventQrls$.add(run);

        preloaderPost(container, {} as any);

        const [links] = getScriptContent().split(`window.addEventListener('load'`);
        expect(links).toContain('["core.js","glue.js","run.js"].map(');
      }));

    it('leaves those bundles out of the links at the end, without counting them', () =>
      withCoreHandlerBundles(async ({ run }) => {
        const { initPreloader } = await import('../core/preloader/bundle-graph');
        const { includePreloader, preloadHandlerBundles } = await import('./preload-impl');
        initPreloader(bundleGraph);
        const { container, getScriptContent } = createContainerUsing(run);

        preloadHandlerBundles(container, undefined);
        const early = getScriptContent();
        includePreloader(container, { ssrPreloads: 1 }, ['run.js', 'handler.js']);

        const [linksAtTheEnd] = getScriptContent()
          .slice(early.length)
          .split(`window.addEventListener('load'`);
        expect(linksAtTheEnd).toContain('["handler.js"].map(');
      }));
  });

  describe('bundles a library asks for with _eagerPreload', () => {
    const graphWhereGotoImportsQwikRouter = ['goto.js', -3, 3, 'qwik-router.js'];
    const graphWhereGotoAndRunImportCore = ['goto.js', -3, 6, 'run.js', -3, 6, 'core.js'];
    const graphWithFiveOtherBundles = [
      'goto.js',
      -3,
      'a.js',
      -2,
      'b.js',
      -2,
      'c.js',
      -2,
      'd.js',
      -2,
      'e.js',
      -2,
    ];

    const createQrl = async (bundle: string, symbol: string) => {
      const { createQRL } = await import('../core/shared/qrl/qrl-class');
      return createQRL(bundle, symbol, () => {});
    };
    const createGotoQrl = () => createQrl('goto.js', 's_goto');

    const askFor = (container: { serializationCtx: any }, qrl: any) =>
      container.serializationCtx.$eagerPreloads$.set(qrl.$hash$, qrl);

    const createContainerAskingFor = (
      item: unknown,
      bundleGraph = graphWhereGotoImportsQwikRouter
    ) => {
      const created = createContainer();
      created.container.resolvedManifest.manifest.bundleGraph = bundleGraph;
      askFor(created.container, item);
      return created;
    };

    it("modulepreloads a QRL's bundle and its static imports mid-stream: gotoQrl gives goto.js and qwik-router.js, before the next element", async () => {
      const { preloadHandlerBundles } = await import('./preload-impl');
      const { container, getScriptContent } = createContainerAskingFor(await createGotoQrl());

      preloadHandlerBundles(container, undefined);

      expect(getScriptContent()).toContain('["qwik-router.js","goto.js"].map(');
    });

    it("a QRL whose bundle the bundle graph doesn't know gets no modulepreload: a QRL in unknown.js gives none", async () => {
      const { preloadHandlerBundles } = await import('./preload-impl');
      const { container, getScriptContent } = createContainerAskingFor(
        await createQrl('unknown.js', 's_unknown')
      );

      preloadHandlerBundles(container, undefined);

      expect(getScriptContent()).toBe('');
    });

    it("modulepreloads no bundle twice: goto.js imports core.js, which core's handlers already modulepreloaded, and core.js gets one", async () => {
      const { preloadHandlerBundles } = await import('./preload-impl');
      const { container, getScriptContent } = createContainer();
      container.resolvedManifest.manifest.bundleGraph = graphWhereGotoAndRunImportCore;
      const coreHandlerQrl = await createQrl('run.js', 's_run');
      container.serializationCtx.$coreHandlerQrls$.set(coreHandlerQrl.$hash$, coreHandlerQrl);
      preloadHandlerBundles(container, undefined);
      const forCoreHandler = getScriptContent();

      askFor(container, await createGotoQrl());
      preloadHandlerBundles(container, undefined);

      expect(forCoreHandler).toContain('["core.js","run.js"].map(');
      expect(getScriptContent().slice(forCoreHandler.length)).toContain('["goto.js"].map(');
    });

    it("the ssrPreloads limit doesn't apply: at 0, gotoQrl still gives goto.js", async () => {
      const { preloadHandlerBundles } = await import('./preload-impl');
      const { container, getScriptContent } = createContainerAskingFor(await createGotoQrl());

      preloadHandlerBundles(container, { ssrPreloads: 0 });

      expect(getScriptContent()).toContain('"goto.js"');
    });

    it('preloader: false turns the modulepreloads off: gotoQrl gives none', async () => {
      const { preloadHandlerBundles } = await import('./preload-impl');
      const { container, getScriptContent } = createContainerAskingFor(await createGotoQrl());

      preloadHandlerBundles(container, false);

      expect(getScriptContent()).toBe('');
    });

    it('dev mode modulepreloads nothing: gotoQrl gives none', async () => {
      vi.stubEnv('DEV', true);
      vi.doMock('./qwik-copy', () => ({
        initPreloader: vi.fn(),
        qTest: false,
      }));
      vi.resetModules();
      const { preloadHandlerBundles } = await import('./preload-impl');
      const { container, getScriptContent } = createContainerAskingFor(await createGotoQrl());

      preloadHandlerBundles(container, undefined);

      expect(getScriptContent()).toBe('');
    });

    it('the speculative modulepreloads at the end of the page neither repeat nor count a bundle modulepreloaded mid-stream: with ssrPreloads at 5, the page still gets 5, without goto.js', async () => {
      const { initPreloader } = await import('../core/preloader/bundle-graph');
      const { includePreloader, preloadHandlerBundles } = await import('./preload-impl');
      initPreloader(graphWithFiveOtherBundles);
      const { container, getScriptContent } = createContainerAskingFor(
        await createGotoQrl(),
        graphWithFiveOtherBundles
      );
      preloadHandlerBundles(container, undefined);
      const midStream = getScriptContent();

      includePreloader(container, { ssrPreloads: 5 }, [
        'goto.js',
        'a.js',
        'b.js',
        'c.js',
        'd.js',
        'e.js',
      ]);

      const atTheEnd = getScriptContent().slice(midStream.length);
      const speculative = JSON.parse(atTheEnd.slice(0, atTheEnd.indexOf('.map(')));
      expect(midStream).toContain('["goto.js"].map(');
      expect(speculative).toHaveLength(5);
      expect(speculative).not.toContain('goto.js');
    });
  });

  it("ranks each render's hint afresh, since SSR shares the preloader's state", async () => {
    const { initPreloader } = await import('../core/preloader/bundle-graph');
    const { getPreloadOrder } = await import('../core/preloader/queue');
    initPreloader(['a.js', 4, 'b.js', 4, 'shared.js']);

    expect(new Set(getPreloadOrder(['a.js']))).toEqual(new Set(['a.js', 'shared.js']));
    expect(new Set(getPreloadOrder(['b.js']))).toEqual(new Set(['b.js', 'shared.js']));
    // The same page again: its import edges must not remember the first render's priorities.
    expect(new Set(getPreloadOrder(['a.js']))).toEqual(new Set(['a.js', 'shared.js']));
  });
});
