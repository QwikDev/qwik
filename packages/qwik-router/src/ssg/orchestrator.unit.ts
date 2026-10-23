import type { QwikRouterConfig, RouteData } from '@qwik.dev/router';
import { afterEach, assert, beforeEach, describe, test, vi } from 'vitest';
import { getLoaderName } from '../middleware/request-handler/request-path';
import { mainThread } from './orchestrator';
import type { Logger, MainContext, System } from './types';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

test('should not await static route modules during route discovery', async () => {
  let renderCount = 0;
  const sys = createSystem({
    routes: {
      _I: () => new Promise(() => {}),
    },
    render: async ({ pathname }) => {
      renderCount++;
      return createRenderResult(pathname);
    },
  });

  const result = await mainThread(sys);

  assert.equal(renderCount, 1);
  assert.equal(result.rendered, 1);
  assert.deepEqual(result.staticPaths, ['/']);
});

test('should only load the page module for dynamic routes', async () => {
  let layoutLoaded = false;
  let pageLoaded = false;
  const sys = createSystem({
    routes: {
      _L: () =>
        new Promise(() => {
          layoutLoaded = true;
        }),
      _W: {
        _P: 'slug',
        _I: async () => {
          pageLoaded = true;
          return {
            default: () => null as any,
            onStaticGenerate() {
              return {
                params: [{ slug: 'alpha' }],
              };
            },
          };
        },
      },
    },
    render: async ({ pathname }) => createRenderResult(pathname),
  });

  const result = await mainThread(sys);

  assert.equal(layoutLoaded, false);
  assert.equal(pageLoaded, true);
  assert.equal(result.rendered, 1);
  assert.deepEqual(result.staticPaths, ['/alpha']);
});

test('should not prefix the base pathname twice when reconstructing routes', async () => {
  const sys = createSystem({
    routes: {
      frameworks: {
        keyed: {
          qwik2: {
            dist: {
              _I: async () => ({
                default: () => null as any,
              }),
            },
          },
        },
      },
    },
    render: async ({ pathname }) => createRenderResult(pathname),
    basePathname: '/frameworks/keyed/qwik2/dist/',
  });

  const result = await mainThread(sys);

  assert.equal(result.rendered, 1);
  assert.deepEqual(result.staticPaths, ['/frameworks/keyed/qwik2/dist/']);
});

test('should prerender <dir>/404.html for each _4 / _E boundary', async () => {
  const sys = createSystem({
    routes: {
      _4: async () => ({ default: () => null as any }),
      blog: {
        _E: async () => ({ default: () => null as any }),
        _I: async () => ({ default: () => null as any }),
      },
    },
    render: async ({ pathname }) => createRenderResult(pathname),
  });

  const result = await mainThread(sys);

  // root _4 → /404.html ; nested _E → /blog/404.html
  assert.include(result.staticPaths, '/404.html');
  assert.include(result.staticPaths, '/blog/404.html');
});

test('should prerender static routes that start with an underscore', async () => {
  const sys = createSystem({
    routes: {
      __drafts: {
        _I: async () => ({ default: () => null as any }),
      },
    },
    render: async ({ pathname }) => createRenderResult(pathname),
  });

  const result = await mainThread(sys);

  assert.deepEqual(result.staticPaths, ['/_drafts']);
});

describe('retries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('failed renders', () => {
    test('does not retry a failed route by default', async () => {
      let renderCount = 0;
      const sys = createSystem({
        routes: { _I: async () => ({ default: () => null as any }) },
        render: async ({ pathname }) => {
          renderCount++;
          return createFailedRenderResult(pathname);
        },
      });

      const result = await runMainThread(sys);

      assert.equal(renderCount, 1);
      assert.equal(result.errors, 1);
    });

    test('retries a failed route until it succeeds', async () => {
      let renderCount = 0;
      const sys = createSystem({
        routes: { _I: async () => ({ default: () => null as any }) },
        render: async ({ pathname }) => {
          renderCount++;
          return renderCount === 1
            ? createFailedRenderResult(pathname)
            : createRenderResult(pathname);
        },
        retries: 2,
      });

      const result = await runMainThread(sys);

      assert.equal(renderCount, 2);
      assert.equal(result.errors, 0);
      assert.equal(result.rendered, 1);
      assert.deepEqual(result.staticPaths, ['/']);
    });

    test('records an error once every retry has failed', async () => {
      let renderCount = 0;
      const sys = createSystem({
        routes: { _I: async () => ({ default: () => null as any }) },
        render: async ({ pathname }) => {
          renderCount++;
          return createFailedRenderResult(pathname);
        },
        retries: 2,
      });

      const result = await runMainThread(sys);

      assert.equal(renderCount, 3);
      assert.equal(result.errors, 1);
      assert.equal(result.rendered, 0);
      assert.deepEqual(result.staticPaths, []);
    });

    test('does not retry a route that redirects or returns a 404', async () => {
      let renderCount = 0;
      const sys = createSystem({
        routes: { _I: async () => ({ default: () => null as any }) },
        render: async ({ pathname }) => {
          renderCount++;
          return { ...createRenderResult(pathname), ok: false, filePath: null };
        },
        retries: 2,
      });

      const result = await runMainThread(sys);

      assert.equal(renderCount, 1);
      assert.equal(result.errors, 0);
      assert.deepEqual(result.staticPaths, []);
    });

    test('logs a warning with the error before each retry', async () => {
      const warnings: string[] = [];
      let renderCount = 0;
      const sys = createSystem({
        routes: { _I: async () => ({ default: () => null as any }) },
        render: async ({ pathname }) => {
          renderCount++;
          return renderCount === 1
            ? createFailedRenderResult(pathname)
            : createRenderResult(pathname);
        },
        retries: 1,
        logger: { ...noopLogger, warn: (message: string) => warnings.push(message) },
      });

      await runMainThread(sys);

      assert.equal(warnings.length, 1);
      assert.include(warnings[0], 'render blip');
    });

    test('counts the routes that needed a retry in the result', async () => {
      let indexRenderCount = 0;
      const sys = createSystem({
        routes: {
          _I: async () => ({ default: () => null as any }),
          about: { _I: async () => ({ default: () => null as any }) },
        },
        render: async ({ pathname }) => {
          if (pathname === '/' && indexRenderCount++ === 0) {
            return createFailedRenderResult(pathname);
          }
          return createRenderResult(pathname);
        },
        retries: 1,
      });

      const result = await runMainThread(sys);

      assert.equal(result.retried, 1);
    });

    test('mentions retried routes in the build summary', async () => {
      const infos: string[] = [];
      let renderCount = 0;
      const sys = createSystem({
        routes: { _I: async () => ({ default: () => null as any }) },
        render: async ({ pathname }) => {
          renderCount++;
          return renderCount === 1
            ? createFailedRenderResult(pathname)
            : createRenderResult(pathname);
        },
        retries: 1,
        logger: { ...noopLogger, info: (message: string) => infos.push(message) },
      });

      await runMainThread(sys);

      assert.isTrue(
        infos.some((message) => message.includes('Retried:') && message.includes('1 route'))
      );
    });
  });

  describe('waiting between attempts', () => {
    test('waits 500ms, doubling up to 2s, before each retry', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const renderTimes: number[] = [];
      const sys = createSystem({
        routes: { _I: async () => ({ default: () => null as any }) },
        render: async ({ pathname }) => {
          renderTimes.push(Date.now());
          return createFailedRenderResult(pathname);
        },
        retries: 4,
      });

      await runMainThread(sys);

      const waits = renderTimes.slice(1).map((time, i) => time - renderTimes[i]);
      assert.deepEqual(waits, [500, 1000, 2000, 2000]);
    });

    test('adds up to 30% at random to each wait', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const renderTimes: number[] = [];
      const sys = createSystem({
        routes: { _I: async () => ({ default: () => null as any }) },
        render: async ({ pathname }) => {
          renderTimes.push(Date.now());
          return createFailedRenderResult(pathname);
        },
        retries: 4,
      });

      await runMainThread(sys);

      const waits = renderTimes.slice(1).map((time, i) => time - renderTimes[i]);
      assert.deepEqual(waits, [650, 1300, 2600, 2600]);
    });

    test('does not finish the build while a retry is waiting', async () => {
      let indexRenderCount = 0;
      const sys = createSystem({
        routes: {
          _I: async () => ({ default: () => null as any }),
          about: { _I: async () => ({ default: () => null as any }) },
        },
        render: async ({ pathname }) => {
          if (pathname === '/' && indexRenderCount++ === 0) {
            return createFailedRenderResult(pathname);
          }
          return createRenderResult(pathname);
        },
        retries: 1,
      });

      const result = await runMainThread(sys);

      assert.equal(result.rendered, 2);
      assert.sameMembers(result.staticPaths, ['/', '/about']);
    });
  });

  describe('listing dynamic routes', () => {
    test('stops the build when onStaticGenerate fails and retries are off', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const sys = createSystem({
        routes: createDynamicRoute(() => {
          throw new Error('cms down');
        }),
        render: async ({ pathname }) => createRenderResult(pathname),
      });

      const done = mainThread(sys).catch((error: Error) => error);
      await vi.runAllTimersAsync();

      assert.include(String(await done), 'cms down');
    });

    test('retries onStaticGenerate until it succeeds', async () => {
      const warnings: string[] = [];
      let callCount = 0;
      const sys = createSystem({
        routes: createDynamicRoute(() => {
          callCount++;
          if (callCount === 1) {
            throw new Error('cms down');
          }
          return { params: [{ slug: 'alpha' }] };
        }),
        render: async ({ pathname }) => createRenderResult(pathname),
        retries: 1,
        logger: { ...noopLogger, warn: (message: string) => warnings.push(message) },
      });

      const result = await runMainThread(sys);

      assert.deepEqual(result.staticPaths, ['/alpha']);
      assert.equal(warnings.length, 1);
      assert.include(warnings[0], 'cms down');
    });

    test('stops the build once onStaticGenerate has failed on every retry', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      let callCount = 0;
      const sys = createSystem({
        routes: createDynamicRoute(() => {
          callCount++;
          throw new Error('cms down');
        }),
        render: async ({ pathname }) => createRenderResult(pathname),
        retries: 2,
      });

      const done = mainThread(sys).catch((error: Error) => error);
      await vi.runAllTimersAsync();

      assert.include(String(await done), 'cms down');
      assert.equal(callCount, 3);
    });
  });
});

async function runMainThread(sys: System) {
  let isFinished = false;
  const done = mainThread(sys).finally(() => {
    isFinished = true;
  });
  await vi.runAllTimersAsync();
  assert.isTrue(isFinished, 'SSG did not finish');
  return done;
}

function createSystem({
  routes,
  render,
  basePathname = '/',
  retries,
  logger = noopLogger,
}: {
  routes: RouteData;
  render: MainContext['render'];
  basePathname?: string;
  retries?: number;
  logger?: Logger;
}): System {
  return {
    createMainProcess: async () => ({
      hasAvailableWorker: () => true,
      render,
      close: async () => {},
    }),
    createLogger: async () => logger,
    getOptions: () =>
      ({
        outDir: 'C:/tmp/out',
        origin: 'https://qwik.dev',
        basePathname,
        retries,
        include: ['/*'],
        render: (() => null) as any,
        qwikRouterConfig: {
          routes,
        } satisfies QwikRouterConfig,
      }) as any,
    ensureDir: async () => {},
    access: async () => false,
    createWriteStream: (() => {
      throw new Error('Not implemented');
    }) as any,
    createTimer: () => () => 0,
    getRouteFilePath: (pathname) =>
      `C:/tmp/out${pathname === '/' ? '/index.html' : `${pathname}/index.html`}`,
    getLoaderFilePath: (pathname, loaderId, manifestHash) =>
      `C:/tmp/out${pathname}${getLoaderName(loaderId, manifestHash)}`,
    getEnv: () => undefined,
    platform: {},
  };
}

function createDynamicRoute(onStaticGenerate: () => unknown): RouteData {
  return {
    _W: {
      _P: 'slug',
      _I: async () => ({ default: () => null as any, onStaticGenerate }),
    },
  } as RouteData;
}

function createFailedRenderResult(pathname: string) {
  return {
    ...createRenderResult(pathname),
    ok: false,
    error: { message: 'render blip', stack: undefined },
    filePath: null,
  };
}

function createRenderResult(pathname: string) {
  return {
    type: 'render' as const,
    pathname,
    url: `https://qwik.dev${pathname}`,
    ok: true,
    error: null,
    filePath: `C:/tmp/out${pathname === '/' ? '/index.html' : `${pathname}/index.html`}`,
    contentType: 'text/html',
    resourceType: 'page' as const,
  };
}
