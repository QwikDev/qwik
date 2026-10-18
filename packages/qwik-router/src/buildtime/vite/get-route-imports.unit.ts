import { type QwikBundle, type QwikManifest } from '@qwik.dev/core/optimizer';
import { describe, expect, test } from 'vitest';
import type { BuiltLayout, BuiltRoute } from '../types';
import { getRouteImports } from './get-route-imports';

describe('modifyBundleGraph', () => {
  test('prioritizes the destination page before shared layout render graphs', () => {
    const manifest = {
      bundles: {
        'layout.js': { origins: ['src/routes/layout.tsx'] },
        'page.js': { origins: ['src/routes/product/index.tsx'] },
      },
    } as unknown as QwikManifest;
    const routes = [
      {
        routeName: 'product/',
        filePath: '/app/src/routes/product/index.tsx',
        layouts: [{ filePath: '/app/src/routes/layout.tsx' }],
      },
    ] as BuiltRoute[];
    expect(getRouteImports(routes, manifest)['product/'].imports).toEqual(['page.js', 'layout.js']);
  });
  test('includes page and layout render roots before their predicted descendants', () => {
    const manifest = {
      mapping: { s_page: 'page-render.js', s_layout: 'layout-render.js' },
      symbols: {
        s_layout: { ctxName: 'component$', parent: null, origin: 'routes/layout.tsx' },
        s_page: { ctxName: 'component$', parent: null, origin: 'routes/product/index.tsx' },
      },
      bundles: {
        'page.js': { origins: ['src/routes/product/index.tsx'] },
        'layout.js': { origins: ['src/routes/layout.tsx'] },
        'page-render.js': {},
        'layout-render.js': {},
      },
    } as unknown as QwikManifest;
    const routes = [
      {
        routeName: 'product/',
        filePath: '/app/src/routes/product/index.tsx',
        layouts: [{ filePath: '/app/src/routes/layout.tsx' }],
      },
    ] as BuiltRoute[];
    expect(getRouteImports(routes, manifest)['product/'].imports).toEqual([
      'page.js',
      'layout.js',
      'page-render.js',
      'layout-render.js',
    ]);
  });

  test('preloads the router config without following unrelated routes', () => {
    const manifest = {
      bundles: {
        'page.js': { origins: ['src/routes/index.tsx'] },
        'other.js': { origins: ['src/routes/other/index.tsx'] },
        'config.js': {
          origins: ['@qwik-router-config'],
          dynamicImports: ['page.js', 'other.js'],
        },
      },
    } as unknown as QwikManifest;
    const routes = [{ routeName: '/', filePath: '/app/src/routes/index.tsx' }] as BuiltRoute[];

    const graph = getRouteImports(routes, manifest);

    expect(graph['/'].imports).toEqual(['config.js', 'page.js']);
    expect(graph['/'].dynamicImports).toBeUndefined();
    expect(graph['config.js'].dynamicImports).toEqual([]);
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
            filePath: '/home/qwik-app/src/routes/layout.tsx',
          },
        ] as BuiltLayout[],
      },
    ] as BuiltRoute[];

    const actualResult = getRouteImports(fakeRoutes, fakeManifest);
    expect(actualResult).toMatchInlineSnapshot(`
      {
        "/": {
          "imports": [
            "q-router-config.js",
            "fake-bundle1.js",
          ],
        },
        "/subroute": {
          "imports": [
            "q-router-config.js",
            "fake-bundle-part-of-sub-route.js",
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
          "imports": [
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
          "imports": [
            "fake-bundle1.js",
          ],
        },
      }
    `);
  });
});
