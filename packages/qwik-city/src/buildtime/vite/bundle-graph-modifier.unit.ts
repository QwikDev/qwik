import {
  type QwikBundle,
  type QwikBundleGraph,
  type QwikManifest,
} from '@builder.io/qwik/optimizer';
import { describe, expect, test } from 'vitest';
import type { BuildLayout, BuildRoute } from '../types';
import { modifyBundleGraph } from './bundle-graph-modifier';

describe('modifyBundleGraph', () => {
  test(`GIVEN 2 routes, one with a layout
        AND a manifest with 3 bundles 
        THEN the bundle graph should contain a -2 separator
        AND the routes and their dependencies`, () => {
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
      } as Record<string, QwikBundle>,
    } as QwikManifest;

    const fakeBundleGraph: QwikBundleGraph = [
      'fake-bundle1.js',
      2,
      'fake-bundle-static-dep.js',
      -1,
      4,
      'fake-bundle-dynamic-dep.js',
      'fake-bundle-part-of-sub-route.js',
      'fake-bundle-part-of-layout.js',
    ];

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

    const actualResult = modifyBundleGraph(fakeRoutes, fakeBundleGraph, fakeManifest);

    const expectedResult: QwikBundleGraph = [
      ...fakeBundleGraph,
      -2, // routes separator
      '/',
      0, // fake-bundle1.js
      '/subroute',
      6, // fake-bundle-part-of-sub-route.js
      7, // fake-bundle-part-of-layout.js
    ];

    expect(actualResult).toEqual(expectedResult);
  });
});
