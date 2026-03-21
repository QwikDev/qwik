import type { QwikRouterConfig, RouteData } from '@qwik.dev/router';
import { assert, test } from 'vitest';
import { mainThread } from './orchestrator';
import type { Logger, MainContext, System } from './types';

const noopLogger: Logger = {
  info: () => {},
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

function createSystem({
  routes,
  render,
  basePathname = '/',
}: {
  routes: RouteData;
  render: MainContext['render'];
  basePathname?: string;
}): System {
  return {
    createMainProcess: async () => ({
      hasAvailableWorker: () => true,
      render,
      close: async () => {},
    }),
    createLogger: async () => noopLogger,
    getOptions: () =>
      ({
        outDir: 'C:/tmp/out',
        origin: 'https://qwik.dev',
        basePathname,
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
    getDataFilePath: (pathname) => `C:/tmp/out${pathname}/q-data.json`,
    getEnv: () => undefined,
    platform: {},
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
