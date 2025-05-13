import { type QwikBundle, type QwikManifest } from '@qwik.dev/core/optimizer';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { generateManifestFromBundles } from '../manifest';
import { convertManifestToBundleGraph } from './bundle-graph';
// You can generate this file by uncommenting the writing code in manifest.ts, building, running `pnpm build.client` in the starters/apps/preload-test dir and moving the output
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
        "handlers.js": "0 (5000/10000)",
        "index.js": "0 (772/15772)",
        "index.qwik.mjs_ErrorBoundary_component_6VMZkqoH00Q.js": "2 (2140/17140)",
        "index.qwik.mjs_Form_form_onSubmit_5DbAsQLGGo4.js": "1 (697/15697)",
        "index.qwik.mjs_Link_component_handlePrefetch_0xCNPioszTk.js": "2 (5000/39886)",
        "index.qwik.mjs_QwikRouterMockProvider_component_goto_dNtHVLGwESE.js": "2 (5000/39886)",
        "index.qwik.mjs_QwikRouterProvider_component_useStyles_BMutFDNOKhc.js": "3 (5000/39886)",
        "index.qwik.mjs_RouterOutlet_component_q56DrQcc9VE.js": "2 (2017/36903)",
        "index.qwik.mjs_routeActionQrl_action_submit_rufUrhffR5k.js": "1 (1983/16983)",
        "index.qwik.mjs_serverQrl_rpc_Nhj4Mq4ilm8.js": "1 (5000/39886)",
        "index.qwik.mjs_spaInit_event_3mjmVvTlJqo.js": "1 (5000/5000)",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_VjDx6RO4Kis.js": "3 (727/15727)",
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js": "2 (3928/18928)",
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js": "2 (4658/39544)",
        "index.tsx_routes_component_vG0UuU4cNCg.js": "5 (4886/19886)",
        "layout.js": "0 (4886/19886)",
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js": "2 (4772/39658)",
        "preloader.js": "0 (5000/5000)",
        "qwik-router.js": "2 (4886/19886)",
        "root.js": "0 (4886/19886)",
        "root.tsx_root_component_9PcKHFjikV0.js": "2 (4886/39772)",
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js": "2 (4886/39772)",
        "src-vendor-lib-helper.ts.js": "0 (4886/4886)",
        "src-vendor-lib-libA.ts.js": "0 (465/5351)",
        "src-vendor-lib-libB.ts.js": "0 (4886/9772)",
      }
    `);

    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "handlers.js",
        37,
        "index.js",
        0,
        -9,
        25,
        "index.qwik.mjs_ErrorBoundary_component_6VMZkqoH00Q.js",
        0,
        "index.qwik.mjs_Form_form_onSubmit_5DbAsQLGGo4.js",
        0,
        "index.qwik.mjs_Link_component_handlePrefetch_0xCNPioszTk.js",
        38,
        "index.qwik.mjs_QwikRouterMockProvider_component_goto_dNtHVLGwESE.js",
        38,
        "index.qwik.mjs_QwikRouterProvider_component_useStyles_BMutFDNOKhc.js",
        38,
        "index.qwik.mjs_routeActionQrl_action_submit_rufUrhffR5k.js",
        0,
        "index.qwik.mjs_RouterOutlet_component_q56DrQcc9VE.js",
        38,
        "index.qwik.mjs_serverQrl_rpc_Nhj4Mq4ilm8.js",
        38,
        "index.qwik.mjs_spaInit_event_3mjmVvTlJqo.js",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_VjDx6RO4Kis.js",
        0,
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js",
        0,
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js",
        38,
        "index.tsx_routes_component_vG0UuU4cNCg.js",
        0,
        "layout.js",
        0,
        -9,
        35,
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js",
        38,
        "preloader.js",
        "qwik-router.js",
        0,
        "root.js",
        0,
        -9,
        44,
        "root.tsx_root_component_9PcKHFjikV0.js",
        38,
        -9,
        48,
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js",
        38,
        "src-vendor-lib-helper.ts.js",
        "src-vendor-lib-libA.ts.js",
        50,
        "src-vendor-lib-libB.ts.js",
        50,
        "BjxcCeNQ9ak",
        -9,
        29,
        "eevMxFvmCM8",
        -7,
        35,
        "99K9SAWjPFQ",
        -9,
        29,
        "LopIayqLfMo",
        -8,
        14,
        "VjDx6RO4Kis",
        -8,
        23,
        "HEFxKy9cwuk",
        -9,
        29,
        "6VMZkqoH00Q",
        -7,
        6,
        "9PcKHFjikV0",
        -7,
        44,
        "9fcUDoGM9Wo",
        -8,
        14,
        "SHtFir1Ia94",
        -7,
        35,
        "cH9twROgaEg",
        -7,
        12,
        "dAo05yeFq1I",
        -7,
        48,
        "ds9jIPT1g9s",
        -7,
        27,
        "lTNqDDf58lI",
        -7,
        10,
        "m7u9ARcfDGU",
        -7,
        25,
        "q56DrQcc9VE",
        -7,
        18,
        "vG0UuU4cNCg",
        -9,
        29,
        "vXTAPbOW0Ig",
        -7,
        38,
        "0pasaG6nmEA",
        -7,
        27,
        "BMutFDNOKhc",
        -8,
        14,
        "Iyy38y0K3Hw",
        -9,
        29,
        "MOLFIZOhXmE",
        -7,
        35,
        "WOcPLNnm2is",
        -7,
        25,
        "3mjmVvTlJqo",
        -6,
        22,
        "5DbAsQLGGo4",
        -6,
        8,
        "Nhj4Mq4ilm8",
        -6,
        20,
        "rufUrhffR5k",
        -6,
        16,
        "0xCNPioszTk",
        -7,
        10,
        "1F0Ft5Y9bOI",
        -7,
        6,
        "ANY7TPAnAd8",
        -7,
        38,
        "BdwdOv10pp0",
        -8,
        14,
        "YCi2vDzuhns",
        -7,
        38,
        "dNtHVLGwESE",
        -7,
        12,
        "ep3t0fF0SDA",
        -9,
        29,
        "lWJp5Z4VtFs",
        -7,
        10,
        "s3XioIi2Huw",
        -8,
        14,
      ]
    `);
  });
});
