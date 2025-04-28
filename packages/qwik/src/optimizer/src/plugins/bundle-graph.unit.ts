import { type QwikBundle, type QwikManifest } from '@builder.io/qwik/optimizer';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { generateManifestFromBundles } from '../manifest';
import { convertManifestToBundleGraph } from './bundle-graph';
// You can generate this file by uncommenting the writing code in manifest.ts, building, running `pnpm build.client` in the starters/apps/preloader-test dir and moving the output
import outputBundles from './fixture-output-bundles.json';

describe('convertManifestToBundleGraph', () => {
  const size = 0,
    total = 0;
  const fakeManifest = {
    bundles: {
      'app.js': { size, total, imports: ['static-dep.js', '@external-dep'] },
      'static-dep.js': {
        size,
        total,
        dynamicImports: ['@other', 'transitive-dep.js', 'dynamic-dep.js', 'no-symbols.js'],
      },
      'dynamic-dep.js': {
        size,
        total,
        imports: ['static-dep.js', 'transitive-dep.js', '@external-dep'],
        dynamicImports: ['has-a-symbol.js', 'boring-dep.js', 'no-symbols.js'],
        origins: ['dynamic-dep.js'],
        symbols: ['sym1'],
      },
      'transitive-dep.js': { size, total, symbols: ['sym4'] },
      'not-used.js': { size, total },
      'has-a-symbol.js': {
        size,
        total,
        dynamicImports: ['large-file.js'],
        symbols: ['sym2'],
        origins: ['dynamic-dep.js_handleClick_sym2.js'],
      },
      'no-symbols.js': { size, total },
      'boring-dep.js': { size, total, symbols: ['sym5'], origins: ['boring-dep.js'] },
      'large-file.js': { size: 100000, total: 100000, symbols: ['sym3'] },
    } as Record<string, QwikBundle>,
    mapping: { sym1: 'dynamic-dep.js', sym2: 'has-a-symbol.js', sym3: 'large-file.js' },
    symbols: {},
    preloader: 'no-symbols.js',
    manifestHash: '123',
    version: '1.0.0',
  } as QwikManifest;

  test('trivial example', () => {
    expect(convertManifestToBundleGraph(fakeManifest)).toEqual([
      'app.js', // 0
      2,
      'static-dep.js', // 2
      -7,
      5,
      // doesn't list 13 because it's also statically imported by dynamic-dep.js
      'dynamic-dep.js', // 5
      2,
      12,
      -9,
      13,
      -7,
      16,
      'transitive-dep.js', // 12
      'has-a-symbol.js', // 13
      -5,
      17,
      'boring-dep.js', // 16
      'large-file.js', // 17
      'sym1', // 18
      -7,
      5,
      'sym2', // 21
      -7,
      13,
      'sym3', // 24
      -5,
      17,
    ]);
  });

  test('empty', () => {
    expect(convertManifestToBundleGraph({} as any)).toEqual([]);
  });

  test('simple file set', () => {
    const manifest = {
      bundles: {
        'a.js': { size, total, imports: ['b.js'], dynamicImports: ['c.js'] },
        'b.js': { size, total, dynamicImports: ['c.js'] },
        'c.js': { size, total, symbols: ['sym1'] },
      } as Record<string, QwikBundle>,
      mapping: {},
    } as QwikManifest;
    expect(convertManifestToBundleGraph(manifest)).toEqual([
      'a.js', // 0
      4,
      -7,
      7,
      'b.js', // 4
      -7,
      7,
      'c.js', // 7
    ]);
  });

  test('adder', () => {
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
      -7,
      5,
      'dynamic-dep.js', // 5
      2,
      8,
      'transitive-dep.js', // 8
      'has-a-symbol.js', // 9
      -5,
      12,
      'large-file.js', // 12
      'sym1', // 13
      -7,
      5,
      'sym2', // 16
      -7,
      9,
      'sym3', // 19
      -5,
      12,
      'dashboard/', // 22
      2,
      -7,
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

    // Interactivity scores
    expect(
      Object.fromEntries(
        Object.entries(manifest.bundles).map(([k, v]) => [
          k,
          `${v.interactivity} (${v.size}/${v.total})`,
        ])
      )
    ).toMatchInlineSnapshot(`
      {
        "core.js": "2 (5000/10000)",
        "index.js": "0 (768/15768)",
        "index.qwik.mjs_Form_form_onSubmit_p0qDGZV34Qs.js": "1 (3191/18191)",
        "index.qwik.mjs_Link_component_handleClick_gZBt5yIBEB4.js": "2 (5000/39888)",
        "index.qwik.mjs_QwikCityMockProvider_component_4XSnxjzQSYM.js": "2 (3306/38194)",
        "index.qwik.mjs_QwikCityProvider_component_OzSZb6UyaCs.js": "3 (5000/39888)",
        "index.qwik.mjs_RouterOutlet_component_KRtEZRf6Xh8.js": "2 (5000/39888)",
        "index.qwik.mjs_routeActionQrl_action_submit_WcRKLKMW88U.js": "1 (5000/20000)",
        "index.qwik.mjs_serverQrl_rpc_AaY04hL3w3A.js": "1 (5000/39888)",
        "index.qwik.mjs_spaInit_event_EMGw8L1tB9Y.js": "1 (5000/5000)",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_0OaA1Rw0yxk.js": "3 (2693/17693)",
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js": "2 (4888/19888)",
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js": "2 (4888/39776)",
        "index.tsx_routes_component_vG0UuU4cNCg.js": "5 (4888/19888)",
        "layout.js": "0 (711/15711)",
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js": "2 (4776/39664)",
        "preloader.js": "0 (5000/5000)",
        "qwik-city.js": "2 (4888/19888)",
        "root.js": "0 (4888/19888)",
        "root.tsx_root_component_9PcKHFjikV0.js": "2 (1786/36674)",
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js": "2 (2976/37864)",
        "src-vendor-lib-helper.ts.js": "0 (573/573)",
        "src-vendor-lib-libA.ts.js": "0 (3369/3942)",
        "src-vendor-lib-libB.ts.js": "0 (4888/5461)",
      }
    `);

    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "core.js",
        35,
        "index.js",
        0,
        -9,
        23,
        "index.qwik.mjs_Form_form_onSubmit_p0qDGZV34Qs.js",
        0,
        "index.qwik.mjs_Link_component_handleClick_gZBt5yIBEB4.js",
        36,
        "index.qwik.mjs_QwikCityMockProvider_component_4XSnxjzQSYM.js",
        36,
        "index.qwik.mjs_QwikCityProvider_component_OzSZb6UyaCs.js",
        36,
        "index.qwik.mjs_routeActionQrl_action_submit_WcRKLKMW88U.js",
        0,
        "index.qwik.mjs_RouterOutlet_component_KRtEZRf6Xh8.js",
        36,
        "index.qwik.mjs_serverQrl_rpc_AaY04hL3w3A.js",
        36,
        "index.qwik.mjs_spaInit_event_EMGw8L1tB9Y.js",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_0OaA1Rw0yxk.js",
        0,
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js",
        0,
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js",
        36,
        "index.tsx_routes_component_vG0UuU4cNCg.js",
        0,
        "layout.js",
        0,
        -9,
        33,
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js",
        36,
        "preloader.js",
        "qwik-city.js",
        0,
        -9,
        16,
        20,
        "root.js",
        0,
        -9,
        45,
        "root.tsx_root_component_9PcKHFjikV0.js",
        36,
        -9,
        49,
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js",
        36,
        "src-vendor-lib-helper.ts.js",
        "src-vendor-lib-libA.ts.js",
        51,
        "src-vendor-lib-libB.ts.js",
        51,
        "BjxcCeNQ9ak",
        -9,
        27,
        "eevMxFvmCM8",
        -7,
        33,
        "99K9SAWjPFQ",
        -9,
        27,
        "n397ZlNS8UY",
        -8,
        12,
        "0OaA1Rw0yxk",
        -8,
        21,
        "HEFxKy9cwuk",
        -9,
        27,
        "4XSnxjzQSYM",
        -7,
        10,
        "9PcKHFjikV0",
        -7,
        45,
        "KRtEZRf6Xh8",
        -7,
        16,
        "OzSZb6UyaCs",
        -8,
        12,
        "SHtFir1Ia94",
        -7,
        33,
        "VJVmS9CcP1U",
        -7,
        0,
        "amqstTwiNo0",
        -7,
        36,
        "bp3n7NtzXfs",
        -7,
        8,
        "dAo05yeFq1I",
        -7,
        49,
        "ds9jIPT1g9s",
        -7,
        25,
        "m7u9ARcfDGU",
        -7,
        23,
        "vG0UuU4cNCg",
        -9,
        27,
        "0pasaG6nmEA",
        -7,
        25,
        "Iyy38y0K3Hw",
        -9,
        27,
        "MOLFIZOhXmE",
        -7,
        33,
        "OC53PuG02nc",
        -8,
        12,
        "WOcPLNnm2is",
        -7,
        23,
        "AaY04hL3w3A",
        -6,
        18,
        "EMGw8L1tB9Y",
        -6,
        20,
        "WcRKLKMW88U",
        -6,
        14,
        "p0qDGZV34Qs",
        -6,
        6,
        "0s3bilOgUys",
        -7,
        0,
        "8hsX2DP6YsI",
        -7,
        36,
        "FpLYno2MZMA",
        -7,
        8,
        "IDVXhQLfmNQ",
        -8,
        12,
        "OBdjRsvd4IY",
        -7,
        36,
        "cTkWSVfU9vo",
        -7,
        10,
        "ep3t0fF0SDA",
        -9,
        27,
        "gZBt5yIBEB4",
        -7,
        8,
        "zQJLLuPn6rA",
        -8,
        12,
      ]
    `);
  });
});
