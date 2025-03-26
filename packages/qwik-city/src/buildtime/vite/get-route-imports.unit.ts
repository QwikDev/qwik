import { type QwikBundle, type QwikManifest } from '@builder.io/qwik/optimizer';
import { describe, expect, test } from 'vitest';
import type { BuildLayout, BuildRoute } from '../types';
import { getRouteImports } from './get-route-imports';

describe('modifyBundleGraph', () => {
  test(`GIVEN 2 routes, one with a layout
        AND a manifest with 3 bundles 
        THEN the bundle graph should contain the routes and their dependencies`, () => {
    const fakeManifest = {
      bundles: {
        'fake-bundle1.js': {
          size: 0,
          imports: ['fake-bundle-static-dep.js'],
          origins: ['src/routes/index.tsx'],
        },
        'fake-bundle-static-dep.js': {
          size: 0,
          dynamicImports: ['fake-bundle-dynamic-dep.js'],
        },
        'fake-bundle-dynamic-dep.js': {
          size: 0,
        },
        'fake-bundle-part-of-sub-route.js': {
          size: 0,
          origins: ['src/routes/subroute/index.tsx', 'src/some/other/component.tsx'],
        },
        'fake-bundle-part-of-layout.js': {
          size: 0,
          origins: ['src/routes/layout.tsx'],
        },
        'q-city-plan.js': {
          size: 0,
          origins: ['@qwik-city-plan'],
        },
      } as Record<string, QwikBundle>,
    } as QwikManifest;

    const fakeRoutes: BuildRoute[] = [
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
        ] as BuildLayout[],
      },
    ] as BuildRoute[];

    const actualResult = getRouteImports(fakeRoutes, fakeManifest);
    expect(actualResult).toMatchInlineSnapshot(`
      {
        "/": {
          "imports": [
            "fake-bundle1.js",
          ],
        },
        "/subroute": {
          "imports": [
            "fake-bundle-part-of-sub-route.js",
            "fake-bundle-part-of-layout.js",
          ],
        },
        "q-city-plan.js": {
          "dynamicImports": [],
          "imports": undefined,
        },
      }
    `);
  });

  test(`GIVEN a mismatch between the bundle graph and the manifest
        THEN the resulted bundle graph routes should not contain -1 (not found) indices `, () => {
    const fakeManifest = {
      bundles: {
        'fake-bundle1.js': {
          size: 0,
          origins: ['src/routes/index.tsx'],
        },
        // 👇 doesn't exist in the bundle graph for some reason
        'fake-bundle2.js': {
          size: 0,
          origins: ['src/routes/index.tsx'],
        },
      } as Record<string, QwikBundle>,
    } as QwikManifest;

    const fakeRoutes: BuildRoute[] = [
      {
        routeName: '/',
        filePath: '/home/qwik-app/src/routes/index.tsx',
      },
    ] as BuildRoute[];

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
});
