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
        dynamicImports: ['@other', 'transitive-dep.js', 'dynamic-dep.js'],
      },
      'dynamic-dep.js': {
        size: 0,
        imports: ['static-dep.js', 'transitive-dep.js', '@external-dep'],
      },
      'transitive-dep.js': {
        size: 0,
      },
      'not-used.js': {
        size: 0,
      },
      'has-a-symbol.js': {
        size: 0,
        symbols: ['sym2'],
      },
    } as Record<string, QwikBundle>,
    mapping: { sym1: 'app.js', sym2: 'has-a-symbol.js' },
    symbols: {},
    manifestHash: '123',
    version: '1.0.0',
  } as QwikManifest;

  test('trivial example', () => {
    expect(convertManifestToBundleGraph(fakeManifest)).toMatchInlineSnapshot(`
      [
        "app.js",
        2,
        "static-dep.js",
        -1,
        5,
        "dynamic-dep.js",
        2,
        8,
        "transitive-dep.js",
        "has-a-symbol.js",
        "sym1",
        0,
        "sym2",
        9,
      ]
    `);
  });
  test('adder', () => {
    expect(
      convertManifestToBundleGraph(
        fakeManifest,
        new Set([
          (_manifest) => {
            return {
              // Remove dynamic imports from dynamic-dep.js
              'dynamic-dep.js': { dynamicImports: [] },
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
    ).toMatchInlineSnapshot(`
      [
        "app.js",
        2,
        "static-dep.js",
        -1,
        7,
        6,
        "dynamic-dep.js",
        "transitive-dep.js",
        "has-a-symbol.js",
        "sym1",
        0,
        "sym2",
        8,
        "dashboard/",
        2,
        -1,
        7,
      ]
    `);
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
        "jn5XSz7NZ88",
        19,
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
      ]
    `);
  });
});
