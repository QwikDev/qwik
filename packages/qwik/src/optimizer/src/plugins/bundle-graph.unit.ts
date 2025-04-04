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
      -5,
      5,
      // doesn't list 13 because it's also statically imported by dynamic-dep.js
      'dynamic-dep.js', // 5
      2,
      12,
      -8,
      13,
      -5,
      16,
      'transitive-dep.js', // 12
      'has-a-symbol.js', // 13
      -5,
      17,
      'boring-dep.js', // 16
      'large-file.js', // 17
      'sym1', // 18
      -5,
      5,
      'sym2', // 21
      -5,
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
      -5,
      7,
      'b.js', // 4
      -5,
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
      -5,
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
      -5,
      5,
      'sym2', // 16
      -5,
      9,
      'sym3', // 19
      -5,
      12,
      'dashboard/', // 22
      2,
      -5,
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
        "@qwik-city-plan.js": "0 (4886/7301)",
        "core.js": "0 (4954/9908)",
        "index.js": "0 (1001/18278)",
        "index.qwik.mjs_ErrorBoundary_component_VJVmS9CcP1U.js": "2 (4954/22231)",
        "index.qwik.mjs_ErrorBoundary_component_useOnWindow_0s3bilOgUys.js": "1 (4954/19816)",
        "index.qwik.mjs_Form_form_onSubmit_p0qDGZV34Qs.js": "1 (598/15460)",
        "index.qwik.mjs_GetForm_component_amqstTwiNo0.js": "2 (4954/39508)",
        "index.qwik.mjs_GetForm_component_form_onSubmit_1_8hsX2DP6YsI.js": "1 (730/15592)",
        "index.qwik.mjs_GetForm_component_form_onSubmit_OBdjRsvd4IY.js": "1 (4954/19816)",
        "index.qwik.mjs_Link_component_bp3n7NtzXfs.js": "2 (3091/37645)",
        "index.qwik.mjs_Link_component_handleClick_gZBt5yIBEB4.js": "1 (957/15819)",
        "index.qwik.mjs_Link_component_handlePrefetch_FpLYno2MZMA.js": "1 (4954/39508)",
        "index.qwik.mjs_QwikCityMockProvider_component_4XSnxjzQSYM.js": "2 (4954/39508)",
        "index.qwik.mjs_QwikCityMockProvider_component_goto_cTkWSVfU9vo.js": "1 (4954/19816)",
        "index.qwik.mjs_QwikCityProvider_component_OzSZb6UyaCs.js": "2 (3792/38346)",
        "index.qwik.mjs_QwikCityProvider_component_goto_IDVXhQLfmNQ.js": "1 (4954/46809)",
        "index.qwik.mjs_QwikCityProvider_component_registerPreventNav_zQJLLuPn6rA.js": "1 (4954/39508)",
        "index.qwik.mjs_QwikCityProvider_component_useStyles_OC53PuG02nc.js": "2 (4954/4954)",
        "index.qwik.mjs_QwikCityProvider_component_useTask_n397ZlNS8UY.js": "3 (4954/46809)",
        "index.qwik.mjs_RouterOutlet_component_KRtEZRf6Xh8.js": "2 (2944/37498)",
        "index.qwik.mjs_routeActionQrl_action_submit_WcRKLKMW88U.js": "1 (4954/19816)",
        "index.qwik.mjs_serverQrl_rpc_AaY04hL3w3A.js": "1 (4954/39508)",
        "index.qwik.mjs_spaInit_event_EMGw8L1tB9Y.js": "1 (4954/4954)",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_0OaA1Rw0yxk.js": "3 (628/15490)",
        "index.tsx_about_component_m7u9ARcfDGU.js": "2 (2305/19582)",
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js": "2 (1135/1135)",
        "index.tsx_form_component_ds9jIPT1g9s.js": "2 (4886/74924)",
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js": "2 (2158/2158)",
        "index.tsx_routes_component_div_button_onClick_BjxcCeNQ9ak.js": "5 (4886/19748)",
        "index.tsx_routes_component_handleClick_ep3t0fF0SDA.js": "1 (4886/40441)",
        "index.tsx_routes_component_useStyles_Iyy38y0K3Hw.js": "2 (4886/4886)",
        "index.tsx_routes_component_useTask_99K9SAWjPFQ.js": "3 (902/15764)",
        "index.tsx_routes_component_useVisibleTask_HEFxKy9cwuk.js": "3 (935/36490)",
        "index.tsx_routes_component_vG0UuU4cNCg.js": "2 (4886/22163)",
        "index2.js": "0 (771/18048)",
        "index3.js": "0 (930/35484)",
        "layout.js": "0 (4886/22163)",
        "layout.tsx_layout_component_SHtFir1Ia94.js": "2 (2598/37152)",
        "layout.tsx_layout_component_div_header_div_label_input_bind_checked_eevMxFvmCM8.js": "2 (4226/19088)",
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js": "2 (1207/1207)",
        "preload-helper.js": "0 (2415/2415)",
        "preloader.js": "0 (4954/4954)",
        "qwik-city.js": "0 (4954/17277)",
        "root.js": "0 (4886/22163)",
        "root.tsx_root_component_9PcKHFjikV0.js": "2 (4886/39440)",
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js": "2 (4886/39440)",
        "src-vendor-lib-helper.ts.js": "0 (4886/4886)",
        "src-vendor-lib-libA.ts.js": "0 (465/5351)",
        "src-vendor-lib-libB.ts.js": "0 (4886/9772)",
      }
    `);

    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "@qwik-city-plan.js",
        118,
        "core.js",
        "index.js",
        2,
        118,
        -9,
        86,
        "index.qwik.mjs_ErrorBoundary_component_useOnWindow_0s3bilOgUys.js",
        2,
        "index.qwik.mjs_ErrorBoundary_component_VJVmS9CcP1U.js",
        2,
        118,
        -6,
        8,
        "index.qwik.mjs_Form_form_onSubmit_p0qDGZV34Qs.js",
        2,
        "index.qwik.mjs_GetForm_component_amqstTwiNo0.js",
        119,
        -6,
        22,
        24,
        "index.qwik.mjs_GetForm_component_form_onSubmit_1_8hsX2DP6YsI.js",
        2,
        "index.qwik.mjs_GetForm_component_form_onSubmit_OBdjRsvd4IY.js",
        2,
        "index.qwik.mjs_Link_component_bp3n7NtzXfs.js",
        119,
        -6,
        31,
        33,
        "index.qwik.mjs_Link_component_handleClick_gZBt5yIBEB4.js",
        2,
        "index.qwik.mjs_Link_component_handlePrefetch_FpLYno2MZMA.js",
        119,
        "index.qwik.mjs_QwikCityMockProvider_component_4XSnxjzQSYM.js",
        119,
        -6,
        39,
        "index.qwik.mjs_QwikCityMockProvider_component_goto_cTkWSVfU9vo.js",
        2,
        "index.qwik.mjs_QwikCityProvider_component_goto_IDVXhQLfmNQ.js",
        0,
        119,
        "index.qwik.mjs_QwikCityProvider_component_OzSZb6UyaCs.js",
        119,
        -6,
        54,
        53,
        41,
        51,
        "index.qwik.mjs_QwikCityProvider_component_registerPreventNav_zQJLLuPn6rA.js",
        119,
        "index.qwik.mjs_QwikCityProvider_component_useStyles_OC53PuG02nc.js",
        "index.qwik.mjs_QwikCityProvider_component_useTask_n397ZlNS8UY.js",
        0,
        119,
        "index.qwik.mjs_routeActionQrl_action_submit_WcRKLKMW88U.js",
        2,
        "index.qwik.mjs_RouterOutlet_component_KRtEZRf6Xh8.js",
        119,
        "index.qwik.mjs_serverQrl_rpc_AaY04hL3w3A.js",
        119,
        "index.qwik.mjs_spaInit_event_EMGw8L1tB9Y.js",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_0OaA1Rw0yxk.js",
        2,
        "index.tsx_about_component_m7u9ARcfDGU.js",
        2,
        118,
        -6,
        71,
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js",
        "index.tsx_form_component_ds9jIPT1g9s.js",
        101,
        -6,
        76,
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js",
        "index.tsx_routes_component_div_button_onClick_BjxcCeNQ9ak.js",
        2,
        "index.tsx_routes_component_handleClick_ep3t0fF0SDA.js",
        3,
        "index.tsx_routes_component_useStyles_Iyy38y0K3Hw.js",
        "index.tsx_routes_component_useTask_99K9SAWjPFQ.js",
        2,
        "index.tsx_routes_component_useVisibleTask_HEFxKy9cwuk.js",
        3,
        "index.tsx_routes_component_vG0UuU4cNCg.js",
        2,
        118,
        -7,
        77,
        -6,
        82,
        84,
        81,
        79,
        "index2.js",
        2,
        118,
        -9,
        66,
        "index3.js",
        119,
        -9,
        72,
        "layout.js",
        2,
        118,
        -9,
        112,
        "layout.tsx_layout_component_div_header_div_label_input_bind_checked_eevMxFvmCM8.js",
        2,
        "layout.tsx_layout_component_SHtFir1Ia94.js",
        119,
        -6,
        110,
        117,
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js",
        "preload-helper.js",
        "qwik-city.js",
        2,
        118,
        "root.js",
        2,
        118,
        -9,
        127,
        "root.tsx_root_component_9PcKHFjikV0.js",
        119,
        -9,
        131,
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js",
        119,
        "src-vendor-lib-helper.ts.js",
        "src-vendor-lib-libA.ts.js",
        133,
        "src-vendor-lib-libB.ts.js",
        133,
        "BjxcCeNQ9ak",
        -7,
        77,
        "eevMxFvmCM8",
        -6,
        110,
        "99K9SAWjPFQ",
        -6,
        82,
        "n397ZlNS8UY",
        -6,
        54,
        "0OaA1Rw0yxk",
        -6,
        64,
        "HEFxKy9cwuk",
        -6,
        84,
        "4XSnxjzQSYM",
        -6,
        35,
        "9PcKHFjikV0",
        -6,
        127,
        "KRtEZRf6Xh8",
        -6,
        59,
        "OzSZb6UyaCs",
        -6,
        44,
        "SHtFir1Ia94",
        -6,
        112,
        "VJVmS9CcP1U",
        -6,
        10,
        "amqstTwiNo0",
        -6,
        17,
        "bp3n7NtzXfs",
        -6,
        26,
        "dAo05yeFq1I",
        -6,
        131,
        "ds9jIPT1g9s",
        -6,
        72,
        "m7u9ARcfDGU",
        -6,
        66,
        "vG0UuU4cNCg",
        -6,
        86,
        "0pasaG6nmEA",
        -6,
        76,
        "Iyy38y0K3Hw",
        -6,
        81,
        "MOLFIZOhXmE",
        -6,
        117,
        "OC53PuG02nc",
        -6,
        53,
        "WOcPLNnm2is",
        -6,
        71,
        "AaY04hL3w3A",
        -6,
        61,
        "EMGw8L1tB9Y",
        -6,
        63,
        "WcRKLKMW88U",
        -6,
        57,
        "p0qDGZV34Qs",
        -6,
        15,
        "0s3bilOgUys",
        -6,
        8,
        "8hsX2DP6YsI",
        -6,
        22,
        "FpLYno2MZMA",
        -6,
        33,
        "IDVXhQLfmNQ",
        -6,
        41,
        "OBdjRsvd4IY",
        -6,
        24,
        "cTkWSVfU9vo",
        -6,
        39,
        "ep3t0fF0SDA",
        -6,
        79,
        "gZBt5yIBEB4",
        -6,
        31,
        "zQJLLuPn6rA",
        -6,
        51,
      ]
    `);
  });
});
