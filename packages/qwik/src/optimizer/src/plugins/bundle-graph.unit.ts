import { type QwikBundle, type QwikManifest } from '@builder.io/qwik/optimizer';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { generateManifestFromBundles } from '../manifest';
import { convertManifestToBundleGraph } from './bundle-graph';
// You can generate this by uncommenting the writing code in manifest.ts, building, running `pnpm serve`, and visiting the perf.prod app
import outputBundles from './fixture-output-bundles.json';

describe('convertManifestToBundleGraph', () => {
  const fakeManifest = {
    bundles: {
      'app.js': {
        size: 0,
        imports: ['static-dep.js', '@external-dep'],
      },
      'static-dep.js': {
        size: 0,
        dynamicImports: ['@other', 'transitive-dep.js', 'dynamic-dep.js', 'no-symbols.js'],
      },
      'dynamic-dep.js': {
        size: 0,
        imports: ['static-dep.js', 'transitive-dep.js', '@external-dep'],
        dynamicImports: ['has-a-symbol.js', 'no-symbols.js'],
        symbols: ['sym1'],
      },
      'transitive-dep.js': {
        size: 0,
        symbols: ['sym4'],
      },
      'not-used.js': {
        size: 0,
      },
      'has-a-symbol.js': {
        size: 0,
        symbols: ['sym2'],
      },
      'no-symbols.js': {
        size: 0,
      },
    } as Record<string, QwikBundle>,
    mapping: { sym1: 'dynamic-dep.js', sym2: 'has-a-symbol.js' },
    symbols: {},
    manifestHash: '123',
    version: '1.0.0',
  } as QwikManifest;

  test.skip('trivial example', () => {
    expect(convertManifestToBundleGraph(fakeManifest)).toEqual([
      'app.js', // 0
      2,
      'static-dep.js', // 2
      -1,
      5,
      // doesn't list 8 because it's also statically imported by dynamic-dep.js
      'dynamic-dep.js', // 5
      2,
      10,
      -1,
      11,
      'transitive-dep.js', // 10
      'has-a-symbol.js', // 11
      'sym1', // 12
      5,
      'sym2', // 14
      11,
    ]);
  });

  test('empty', () => {
    expect(convertManifestToBundleGraph({} as any)).toEqual([]);
  });

  test('simple file set', () => {
    const manifest = {
      bundles: {
        'a.js': {
          size: 0,
          imports: ['b.js'],
          dynamicImports: ['c.js'],
        },
        'b.js': {
          size: 0,
          dynamicImports: ['c.js'],
        },
        'c.js': {
          size: 0,
          symbols: ['sym1'],
        },
      } as Record<string, QwikBundle>,
      mapping: {},
    } as QwikManifest;
    expect(convertManifestToBundleGraph(manifest)).toEqual([
      'a.js', // 0
      4,
      -1,
      7,
      'b.js', // 4
      -1,
      7,
      'c.js', // 7
    ]);
  });

  test.skip('adder', () => {
    expect(
      convertManifestToBundleGraph(
        fakeManifest,
        new Set([
          (manifest) => {
            return {
              // Remove dynamic imports from dynamic-dep.js
              'dynamic-dep.js': { ...manifest.bundles['dynamic-dep.js'], dynamicImports: [] },
            };
          },
          (_manifest) => {
            return {
              // Add a route
              'dashboard/': {
                imports: ['static-dep.js'],
                dynamicImports: ['transitive-dep.js'],
              },
            };
          },
        ])
      )
    ).toEqual([
      'app.js', // 0
      2,
      'static-dep.js', // 2
      -1,
      5,
      'dynamic-dep.js', // 5
      2,
      8,
      'transitive-dep.js', // 8
      'has-a-symbol.js', // 9
      'sym1', // 10
      5,
      'sym2', // 12
      9,
      'dashboard/', // 14
      2,
      -1,
      8,
    ]);
  });

  test(`works`, () => {
    const manifest = generateManifestFromBundles(
      path as any,
      outputBundles.segments as any,
      [],
      outputBundles.bundles as any,
      { rootDir: '/', outDir: '/' } as any,
      console.error
    );

    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "app.js",
        30,
        31,
        -1,
        19,
        "app.tsx_App_component_div_div_div_div_div_div_button_onClick_1_WC1qsF4RHoU.js",
        0,
        "app.tsx_App_component_div_div_div_div_div_div_button_onClick_2_cibDwmrlmRI.js",
        0,
        "app.tsx_App_component_div_div_div_div_div_div_button_onClick_3_dHjr9JWbW34.js",
        30,
        "app.tsx_App_component_div_div_div_div_div_div_button_onClick_4_5fYbrS6ABNA.js",
        30,
        "app.tsx_App_component_div_div_div_div_div_div_button_onClick_5_rpMfjSetIeI.js",
        30,
        "app.tsx_App_component_div_div_div_div_div_div_button_onClick_wEyctjlC58Q.js",
        0,
        "app.tsx_App_component_div_table_tbody_tr_td_a_onClick_DDeCLEw4BYU.js",
        30,
        "app.tsx_App_component_jn5XSz7NZ88.js",
        30,
        31,
        -1,
        5,
        7,
        9,
        11,
        13,
        15,
        17,
        "core.js",
        "preload-helper.js",
        "root.js",
        0,
        "5fYbrS6ABNA",
        11,
        "DDeCLEw4BYU",
        17,
        "WC1qsF4RHoU",
        5,
        "cibDwmrlmRI",
        7,
        "dHjr9JWbW34",
        9,
        "rpMfjSetIeI",
        13,
        "wEyctjlC58Q",
        15,
        "jn5XSz7NZ88",
        19,
      ]
    `);
  });
});
