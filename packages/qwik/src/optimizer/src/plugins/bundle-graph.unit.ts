import { type QwikBundle, type QwikManifest } from '@builder.io/qwik/optimizer';
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
      console.error,
      (p) => path.relative('build', p)
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
        "@qwik-city-plan.js": "0 (4886/7301)",
        "core.js": "0 (4954/4954)",
        "index.js": "0 (1001/8370)",
        "index.qwik.mjs_ErrorBoundary_component_VJVmS9CcP1U.js": "2 (4954/12323)",
        "index.qwik.mjs_ErrorBoundary_component_useOnWindow_0s3bilOgUys.js": "1 (4954/9908)",
        "index.qwik.mjs_Form_form_onSubmit_p0qDGZV34Qs.js": "1 (598/5552)",
        "index.qwik.mjs_GetForm_component_amqstTwiNo0.js": "2 (4954/24646)",
        "index.qwik.mjs_GetForm_component_form_onSubmit_1_8hsX2DP6YsI.js": "1 (730/5684)",
        "index.qwik.mjs_GetForm_component_form_onSubmit_OBdjRsvd4IY.js": "1 (4954/9908)",
        "index.qwik.mjs_Link_component_bp3n7NtzXfs.js": "2 (3091/22783)",
        "index.qwik.mjs_Link_component_handleClick_gZBt5yIBEB4.js": "1 (957/5911)",
        "index.qwik.mjs_Link_component_handlePrefetch_FpLYno2MZMA.js": "1 (4954/24646)",
        "index.qwik.mjs_QwikCityMockProvider_component_4XSnxjzQSYM.js": "2 (4954/24646)",
        "index.qwik.mjs_QwikCityMockProvider_component_goto_cTkWSVfU9vo.js": "1 (4954/9908)",
        "index.qwik.mjs_QwikCityProvider_component_OzSZb6UyaCs.js": "2 (3792/23484)",
        "index.qwik.mjs_QwikCityProvider_component_goto_IDVXhQLfmNQ.js": "1 (4954/31947)",
        "index.qwik.mjs_QwikCityProvider_component_registerPreventNav_zQJLLuPn6rA.js": "1 (4954/24646)",
        "index.qwik.mjs_QwikCityProvider_component_useStyles_OC53PuG02nc.js": "2 (4954/4954)",
        "index.qwik.mjs_QwikCityProvider_component_useTask_n397ZlNS8UY.js": "3 (4954/31947)",
        "index.qwik.mjs_RouterOutlet_component_KRtEZRf6Xh8.js": "2 (2944/22636)",
        "index.qwik.mjs_routeActionQrl_action_submit_WcRKLKMW88U.js": "1 (4954/9908)",
        "index.qwik.mjs_serverQrl_rpc_AaY04hL3w3A.js": "1 (4954/24646)",
        "index.qwik.mjs_spaInit_event_EMGw8L1tB9Y.js": "1 (4954/4954)",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_0OaA1Rw0yxk.js": "3 (628/5582)",
        "index.tsx_about_component_m7u9ARcfDGU.js": "2 (2305/9674)",
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js": "2 (1135/1135)",
        "index.tsx_form_component_ds9jIPT1g9s.js": "2 (4886/45200)",
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js": "2 (2158/2158)",
        "index.tsx_routes_component_div_button_onClick_BjxcCeNQ9ak.js": "5 (4886/9840)",
        "index.tsx_routes_component_handleClick_ep3t0fF0SDA.js": "1 (4886/20625)",
        "index.tsx_routes_component_useStyles_Iyy38y0K3Hw.js": "2 (4886/4886)",
        "index.tsx_routes_component_useTask_99K9SAWjPFQ.js": "3 (902/5856)",
        "index.tsx_routes_component_useVisibleTask_HEFxKy9cwuk.js": "3 (935/16674)",
        "index.tsx_routes_component_vG0UuU4cNCg.js": "2 (4886/12255)",
        "index2.js": "0 (771/8140)",
        "index3.js": "0 (930/20622)",
        "layout.js": "0 (4886/12255)",
        "layout.tsx_layout_component_SHtFir1Ia94.js": "2 (2598/22290)",
        "layout.tsx_layout_component_div_header_div_label_input_bind_checked_eevMxFvmCM8.js": "2 (4226/9180)",
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js": "2 (1207/1207)",
        "preload-helper.js": "0 (2415/2415)",
        "preloader.js": "0 (4954/4954)",
        "qwik-city.js": "0 (4954/12323)",
        "root.js": "0 (4886/12255)",
        "root.tsx_root_component_9PcKHFjikV0.js": "2 (4886/24578)",
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js": "2 (4886/24578)",
        "src-vendor-lib-helper.ts.js": "0 (4886/4886)",
        "src-vendor-lib-libA.ts.js": "0 (465/5351)",
        "src-vendor-lib-libB.ts.js": "0 (4886/9772)",
      }
    `);

    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "@qwik-city-plan.js",
        130,
        -5,
        8,
        108,
        113,
        117,
        "core.js",
        "index.js",
        7,
        130,
        -9,
        96,
        -5,
        146,
        148,
        "index.qwik.mjs_ErrorBoundary_component_useOnWindow_0s3bilOgUys.js",
        7,
        "index.qwik.mjs_ErrorBoundary_component_VJVmS9CcP1U.js",
        7,
        130,
        -6,
        16,
        "index.qwik.mjs_Form_form_onSubmit_p0qDGZV34Qs.js",
        7,
        "index.qwik.mjs_GetForm_component_amqstTwiNo0.js",
        131,
        -6,
        30,
        32,
        "index.qwik.mjs_GetForm_component_form_onSubmit_1_8hsX2DP6YsI.js",
        7,
        "index.qwik.mjs_GetForm_component_form_onSubmit_OBdjRsvd4IY.js",
        7,
        "index.qwik.mjs_Link_component_bp3n7NtzXfs.js",
        131,
        -6,
        39,
        41,
        "index.qwik.mjs_Link_component_handleClick_gZBt5yIBEB4.js",
        7,
        "index.qwik.mjs_Link_component_handlePrefetch_FpLYno2MZMA.js",
        131,
        "index.qwik.mjs_QwikCityMockProvider_component_4XSnxjzQSYM.js",
        131,
        -6,
        47,
        "index.qwik.mjs_QwikCityMockProvider_component_goto_cTkWSVfU9vo.js",
        7,
        "index.qwik.mjs_QwikCityProvider_component_goto_IDVXhQLfmNQ.js",
        0,
        131,
        "index.qwik.mjs_QwikCityProvider_component_OzSZb6UyaCs.js",
        131,
        -8,
        64,
        -7,
        63,
        -6,
        49,
        61,
        "index.qwik.mjs_QwikCityProvider_component_registerPreventNav_zQJLLuPn6rA.js",
        131,
        "index.qwik.mjs_QwikCityProvider_component_useStyles_OC53PuG02nc.js",
        "index.qwik.mjs_QwikCityProvider_component_useTask_n397ZlNS8UY.js",
        0,
        131,
        "index.qwik.mjs_routeActionQrl_action_submit_WcRKLKMW88U.js",
        7,
        "index.qwik.mjs_RouterOutlet_component_KRtEZRf6Xh8.js",
        131,
        "index.qwik.mjs_serverQrl_rpc_AaY04hL3w3A.js",
        131,
        "index.qwik.mjs_spaInit_event_EMGw8L1tB9Y.js",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_0OaA1Rw0yxk.js",
        7,
        "index.tsx_about_component_m7u9ARcfDGU.js",
        7,
        130,
        -7,
        81,
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js",
        "index.tsx_form_component_ds9jIPT1g9s.js",
        113,
        -7,
        86,
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js",
        "index.tsx_routes_component_div_button_onClick_BjxcCeNQ9ak.js",
        7,
        "index.tsx_routes_component_handleClick_ep3t0fF0SDA.js",
        8,
        "index.tsx_routes_component_useStyles_Iyy38y0K3Hw.js",
        "index.tsx_routes_component_useTask_99K9SAWjPFQ.js",
        7,
        "index.tsx_routes_component_useVisibleTask_HEFxKy9cwuk.js",
        8,
        "index.tsx_routes_component_vG0UuU4cNCg.js",
        7,
        130,
        -9,
        87,
        -8,
        92,
        94,
        -7,
        91,
        -6,
        89,
        "index2.js",
        7,
        130,
        -9,
        76,
        "index3.js",
        131,
        -9,
        82,
        "layout.js",
        7,
        130,
        -9,
        124,
        "layout.tsx_layout_component_div_header_div_label_input_bind_checked_eevMxFvmCM8.js",
        7,
        "layout.tsx_layout_component_SHtFir1Ia94.js",
        131,
        -7,
        122,
        129,
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js",
        "preload-helper.js",
        "qwik-city.js",
        7,
        130,
        "root.js",
        7,
        130,
        -9,
        139,
        "root.tsx_root_component_9PcKHFjikV0.js",
        131,
        -9,
        143,
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js",
        131,
        "src-vendor-lib-helper.ts.js",
        "src-vendor-lib-libA.ts.js",
        145,
        "src-vendor-lib-libB.ts.js",
        145,
        "BjxcCeNQ9ak",
        -9,
        87,
        "eevMxFvmCM8",
        -7,
        122,
        "99K9SAWjPFQ",
        -8,
        92,
        "n397ZlNS8UY",
        -8,
        64,
        "0OaA1Rw0yxk",
        -8,
        74,
        "HEFxKy9cwuk",
        -8,
        94,
        "4XSnxjzQSYM",
        -7,
        43,
        "9PcKHFjikV0",
        -7,
        139,
        "KRtEZRf6Xh8",
        -7,
        69,
        "OzSZb6UyaCs",
        -7,
        52,
        "SHtFir1Ia94",
        -7,
        124,
        "VJVmS9CcP1U",
        -7,
        18,
        "amqstTwiNo0",
        -7,
        25,
        "bp3n7NtzXfs",
        -7,
        34,
        "dAo05yeFq1I",
        -7,
        143,
        "ds9jIPT1g9s",
        -7,
        82,
        "m7u9ARcfDGU",
        -7,
        76,
        "vG0UuU4cNCg",
        -7,
        96,
        "0pasaG6nmEA",
        -7,
        86,
        "Iyy38y0K3Hw",
        -7,
        91,
        "MOLFIZOhXmE",
        -7,
        129,
        "OC53PuG02nc",
        -7,
        63,
        "WOcPLNnm2is",
        -7,
        81,
        "AaY04hL3w3A",
        -6,
        71,
        "EMGw8L1tB9Y",
        -6,
        73,
        "WcRKLKMW88U",
        -6,
        67,
        "p0qDGZV34Qs",
        -6,
        23,
        "0s3bilOgUys",
        -6,
        16,
        "8hsX2DP6YsI",
        -6,
        30,
        "FpLYno2MZMA",
        -6,
        41,
        "IDVXhQLfmNQ",
        -6,
        49,
        "OBdjRsvd4IY",
        -6,
        32,
        "cTkWSVfU9vo",
        -6,
        47,
        "ep3t0fF0SDA",
        -6,
        89,
        "gZBt5yIBEB4",
        -6,
        39,
        "zQJLLuPn6rA",
        -6,
        61,
      ]
    `);
  });
});
