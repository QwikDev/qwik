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

  test('records the error once all retries fail', async () => {
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

  test('warns with the error message when it retries a route', async () => {
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

  test('restarts the worker and retries a render that timed out', async () => {
    const restarted: string[] = [];
    let renderCount = 0;
    const sys = createSystem({
      routes: { _I: async () => ({ default: () => null as any }) },
      render: ({ pathname }) => {
        renderCount++;
        return renderCount === 1
          ? new Promise<never>(() => {})
          : Promise.resolve(createRenderResult(pathname));
      },
      restartWorker: async (pathname) => {
        restarted.push(pathname);
      },
      retries: 1,
    });

    const result = await runMainThread(sys);

    assert.deepEqual(restarted, ['/']);
    assert.equal(renderCount, 2);
    assert.equal(result.rendered, 1);
  });

  test('stops the build when a render times out with no retries left', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sys = createSystem({
      routes: { _I: async () => ({ default: () => null as any }) },
      render: () => new Promise<never>(() => {}),
    });

    const done = mainThread(sys).catch((error: Error) => error);
    await vi.runAllTimersAsync();

    assert.include(String(await done), 'timed out');
  });

  test('resumes the queue after a slow worker restart', async () => {
    let busySlots = 0;
    let renderCount = 0;
    const sys = createSystem({
      routes: { _I: async () => ({ default: () => null as any }) },
      hasAvailableWorker: () => busySlots === 0,
      render: ({ pathname }) => {
        renderCount++;
        if (renderCount === 1) {
          busySlots++;
          return new Promise<never>(() => {});
        }
        return Promise.resolve(createRenderResult(pathname));
      },
      restartWorker: () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            busySlots = 0;
            resolve();
          }, 1000)
        ),
      retries: 1,
    });

    const result = await runMainThread(sys);

    assert.equal(renderCount, 2);
    assert.equal(result.rendered, 1);
  });

  test('waits 500ms, doubling up to 2s, before each retry', async () => {
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

  test('keeps the build open while a retry waits', async () => {
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
  hasAvailableWorker = () => true,
  restartWorker = async () => {},
}: {
  routes: RouteData;
  render: MainContext['render'];
  basePathname?: string;
  retries?: number;
  logger?: Logger;
  hasAvailableWorker?: MainContext['hasAvailableWorker'];
  restartWorker?: MainContext['restartWorker'];
}): System {
  return {
    createMainProcess: async () => ({
      hasAvailableWorker,
      render,
      restartWorker,
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
