import { type QwikBundle, type QwikManifest } from '@qwik.dev/core/optimizer';
import { describe, expect, test } from 'vitest';
import type { BuiltLayout, BuiltRoute } from '../types';
import { getRouteImports } from './get-route-imports';

describe('modifyBundleGraph', () => {
  test('keys catch-all routes with the trailing slash the runtime looks up', () => {
    const manifest = {
      bundles: { 'docs.js': { origins: ['src/routes/docs/[...slug]/index.tsx'] } },
    } as unknown as QwikManifest;
    const routes = [
      { routeName: 'docs/[...slug]', filePath: '/app/src/routes/docs/[...slug]/index.tsx' },
    ] as BuiltRoute[];
    expect(Object.keys(getRouteImports(routes, manifest))).toEqual(['docs/[...slug]/']);
  });

  test('lets the preloader follow the router config from the bundle that imports it', () => {
    const size = 0;
    const total = 0;
    const manifest = {
      bundles: {
        'router.js': {
          size,
          total,
          imports: ['core.js'],
          dynamicImports: ['q-router-config.js', 'http-error.js', 'loader-signal.js'],
          qrlImports: ['loader-signal.js'],
        },
        'q-router-config.js': { size, total, origins: ['@qwik-router-config'] },
      } as Record<string, QwikBundle>,
    } as QwikManifest;

    const routerBundle = getRouteImports([], manifest)['router.js'];

    expect(routerBundle.imports).toEqual(['core.js']);
    expect(routerBundle.dynamicImports).toEqual(['loader-signal.js', 'q-router-config.js']);
  });

  test("keeps the QRL edges of the chunk that holds the router config: qwik-router.js still leads to the server$ segment's chunk", () => {
    const size = 0;
    const total = 0;
    const manifest = {
      bundles: {
        'qwik-router.js': {
          size,
          total,
          origins: ['index.qwik.mjs', '@qwik-router-config'],
          dynamicImports: ['server-fn.js', 'about.js'],
          qrlImports: ['server-fn.js'],
        },
        'server-fn.js': { size, total },
        'about.js': { size, total, origins: ['src/routes/about/index.tsx'] },
      } as Record<string, QwikBundle>,
    } as QwikManifest;

    expect(getRouteImports([], manifest)['qwik-router.js'].dynamicImports).toEqual([
      'server-fn.js',
    ]);
  });

  test(`GIVEN 2 routes, one with a layout
        AND a manifest with 3 bundles 
        THEN the bundle graph should contain the routes and their dependencies`, () => {
    const size = 0;
    const total = 0;
    const fakeManifest = {
      bundles: {
        'fake-bundle1.js': {
          size,
          total,
          imports: ['fake-bundle-static-dep.js'],
          origins: ['src/routes/index.tsx'],
        },
        'fake-bundle-static-dep.js': {
          size,
          total,
          dynamicImports: ['fake-bundle-dynamic-dep.js'],
        },
        'fake-bundle-dynamic-dep.js': { size, total },
        'fake-bundle-part-of-sub-route.js': {
          size,
          total,
          origins: ['src/routes/subroute/index.tsx', 'src/some/other/component.tsx'],
        },
        'fake-bundle-part-of-layout.js': { size, total, origins: ['src/routes/layout.tsx'] },
        'q-router-config.js': { size, total, origins: ['@qwik-router-config'] },
      } as Record<string, QwikBundle>,
    } as QwikManifest;

    const fakeRoutes: BuiltRoute[] = [
      {
        routeName: '/',
        filePath: '/home/qwik-app/src/routes/index.tsx',
      },
      {
        routeName: '/subroute',
        filePath: '/home/qwik-app/src/routes/subroute/index.tsx',
        layouts: [
          {
            id: 'Layout',
            filePath: '/home/qwik-app/src/routes/layout.tsx',
          },
        ] as BuiltLayout[],
      },
    ] as BuiltRoute[];

    const actualResult = getRouteImports(fakeRoutes, fakeManifest);
    expect(actualResult).toMatchInlineSnapshot(`
      {
        "/": {
          "dynamicImports": [
            "fake-bundle1.js",
          ],
        },
        "/subroute/": {
          "dynamicImports": [
            "fake-bundle-part-of-sub-route.js",
          ],
        },
        "Layout": {
          "dynamicImports": [
            "fake-bundle-part-of-layout.js",
          ],
        },
        "q-router-config.js": {
          "dynamicImports": undefined,
          "origins": [
            "@qwik-router-config",
          ],
          "size": 0,
          "total": 0,
        },
      }
    `);
  });

  describe('layouts', () => {
    const size = 0;
    const total = 0;
    const rootLayout = { id: 'Layout', filePath: '/app/src/routes/layout.tsx' } as BuiltLayout;
    const narrowLayout = {
      id: 'LayoutNarrow',
      filePath: '/app/src/routes/layout-narrow.tsx',
    } as BuiltLayout;
    const manifest = {
      bundles: {
        'layout.js': { size, total, origins: ['src/routes/layout.tsx'] },
        'layout-narrow.js': { size, total, origins: ['src/routes/layout-narrow.tsx'] },
        'docs.js': { size, total, origins: ['src/routes/docs/index.tsx'] },
        'about.js': { size, total, origins: ['src/routes/about/index@narrow.tsx'] },
      } as Record<string, QwikBundle>,
    } as QwikManifest;
    const routes = [
      { routeName: 'docs/', filePath: '/app/src/routes/docs/index.tsx', layouts: [rootLayout] },
      {
        routeName: 'about/',
        filePath: '/app/src/routes/about/index@narrow.tsx',
        layouts: [narrowLayout],
      },
    ] as BuiltRoute[];

    test('gives each layout file its own entry, keyed by its id', () => {
      const routeImports = getRouteImports(routes, manifest);

      expect(routeImports['Layout']).toEqual({ dynamicImports: ['layout.js'] });
      expect(routeImports['docs/']).toEqual({ dynamicImports: ['docs.js'] });
    });

    test('keeps two layouts of one folder apart', () => {
      const routeImports = getRouteImports(routes, manifest);

      expect(routeImports['Layout']).toEqual({ dynamicImports: ['layout.js'] });
      expect(routeImports['LayoutNarrow']).toEqual({ dynamicImports: ['layout-narrow.js'] });
    });

    test('no layout key equals a route name', () => {
      const names = Object.keys(getRouteImports(routes, manifest));
      const layoutKeys = names.filter((name) => !name.endsWith('/'));

      expect(layoutKeys).toEqual(['Layout', 'LayoutNarrow']);
    });

    test('a bundle that holds both a page and its layout stays under the route', () => {
      const sharedManifest = {
        bundles: {
          'docs-and-layout.js': {
            size,
            total,
            origins: ['src/routes/layout.tsx', 'src/routes/docs/index.tsx'],
          },
        } as Record<string, QwikBundle>,
      } as QwikManifest;

      const routeImports = getRouteImports([routes[0]], sharedManifest);

      expect(routeImports['docs/']).toEqual({ dynamicImports: ['docs-and-layout.js'] });
    });
  });

  test(`GIVEN a mismatch between the bundle graph and the manifest
        THEN the resulted bundle graph routes should not contain -1 (not found) indices `, () => {
    const size = 0;
    const total = 0;
    const fakeManifest = {
      bundles: {
        'fake-bundle1.js': { size, total, origins: ['src/routes/index.tsx'] },
        // 👇 doesn't exist in the bundle graph for some reason
        'fake-bundle2.js': { size, total, origins: ['src/routes/index.tsx'] },
      } as Record<string, QwikBundle>,
    } as QwikManifest;

    const fakeRoutes: BuiltRoute[] = [
      {
        routeName: '/',
        filePath: '/home/qwik-app/src/routes/index.tsx',
      },
    ] as BuiltRoute[];

    const actualResult = getRouteImports(fakeRoutes, fakeManifest);

    expect(actualResult).toMatchInlineSnapshot(`
      {
        "/": {
          "dynamicImports": [
            "fake-bundle1.js",
            "fake-bundle2.js",
          ],
        },
      }
    `);
  });

  test(`GIVEN a bundle with multiple origins
        WHEN a later origin matches the route
        THEN the bundle should still be included in the route imports`, () => {
    const size = 0;
    const total = 0;
    const fakeManifest = {
      bundles: {
        'fake-bundle1.js': {
          size,
          total,
          origins: ['src/components/button.tsx', 'src/routes/index.tsx'],
        },
      } as Record<string, QwikBundle>,
    } as QwikManifest;

    const fakeRoutes: BuiltRoute[] = [
      {
        routeName: '/',
        filePath: '/home/qwik-app/src/routes/index.tsx',
      },
    ] as BuiltRoute[];

    const actualResult = getRouteImports(fakeRoutes, fakeManifest);

    expect(actualResult).toMatchInlineSnapshot(`
      {
        "/": {
          "dynamicImports": [
            "fake-bundle1.js",
          ],
        },
      }
    `);
  });
});
