import { type QwikBundle, type QwikManifest } from '@qwik.dev/core/optimizer';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { generateManifestFromBundles } from '../manifest';
import { convertManifestToBundleGraph } from './bundle-graph';
// Frozen sample from an old, smaller preloader-test build; kept as-is so the snapshots stay reviewable.
// Regenerating (uncomment the writing code in manifest.ts, build, run `pnpm build.client` in
// e2e/qwik-e2e/apps/preloader-test, move the output) now yields 300+ bundles from the counters.
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
    expect(convertManifestToBundleGraph(fakeManifest)).toMatchInlineSnapshot(`
      [
        "app.js",
        2,
        "static-dep.js",
        -65,
        5,
        "dynamic-dep.js",
        2,
        12,
        -90,
        13,
        -65,
        16,
        "transitive-dep.js",
        "has-a-symbol.js",
        -48,
        17,
        "boring-dep.js",
        "large-file.js",
        "sym1",
        -65,
        5,
        "sym2",
        -65,
        13,
        "sym3",
        -48,
        17,
      ]
    `);
  });

  test('empty', () => {
    expect(convertManifestToBundleGraph({} as any)).toMatchInlineSnapshot(`[]`);
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
    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "a.js",
        4,
        -65,
        7,
        "b.js",
        -65,
        7,
        "c.js",
      ]
    `);
  });

  test('import cycle through the reduced bundle keeps reachable deps', () => {
    const manifest = {
      bundles: {
        'x.js': { size, total, imports: ['a.js', 'd.js'] },
        'a.js': { size, total, imports: ['x.js'] },
        'd.js': { size, total },
      } as Record<string, QwikBundle>,
      mapping: {},
    } as QwikManifest;
    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "x.js",
        3,
        5,
        "a.js",
        0,
        "d.js",
      ]
    `);
  });

  test('import cycle keeps dynamic deps but still reduces them', () => {
    const manifest = {
      bundles: {
        'x.js': { size, total, imports: ['a.js'], dynamicImports: ['a.js', 'd.js', 'e.js'] },
        'a.js': { size, total, imports: ['x.js'], symbols: ['sym1'] },
        'd.js': { size, total, symbols: ['sym2'] },
        'e.js': { size, total, imports: ['d.js'], symbols: ['sym3'] },
      } as Record<string, QwikBundle>,
      mapping: {},
    } as QwikManifest;
    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "x.js",
        4,
        -65,
        7,
        "a.js",
        0,
        "d.js",
        "e.js",
        6,
      ]
    `);
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
    ).toMatchInlineSnapshot(`
      [
        "app.js",
        2,
        "static-dep.js",
        -65,
        5,
        "dynamic-dep.js",
        2,
        8,
        "transitive-dep.js",
        "has-a-symbol.js",
        -48,
        12,
        "large-file.js",
        "sym1",
        -65,
        5,
        "sym2",
        -65,
        9,
        "sym3",
        -48,
        12,
        "dashboard/",
        2,
        -65,
        8,
      ]
    `);
  });

  test('damps the probability of high-fan-out dynamic imports', () => {
    // A bundle that dynamically imports many alternatives (a registry / a router that can render
    // any of N pages) should score each edge far lower than a bundle with only a couple of lazy
    // deps (a modal) — so a probability floor can drop the registry without dropping the modal.
    const size = 0,
      total = 0;
    const dyn = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}-${i}.js`);
    const bundles: Record<string, QwikBundle> = {
      'app.js': { size, total, dynamicImports: ['few.js', 'many.js'] },
      'few.js': { size, total, dynamicImports: dyn(2, 'few'), symbols: ['few'] },
      'many.js': { size, total, dynamicImports: dyn(20, 'many'), symbols: ['many'] },
    };
    for (const d of [...dyn(2, 'few'), ...dyn(20, 'many')]) {
      bundles[d] = { size, total, symbols: [d] };
    }
    const graph = convertManifestToBundleGraph({ bundles, mapping: {} } as any);

    // Decode the per-dynamic-dep probabilities of a given bundle from the flat graph.
    const probsOf = (name: string) => {
      const out: number[] = [];
      let prob = 1;
      for (let j = graph.indexOf(name) + 1; j < graph.length && typeof graph[j] !== 'string'; j++) {
        const v = graph[j] as number;
        v < 0 ? (prob = -v / 100) : out.push(prob);
      }
      return out;
    };

    const few = probsOf('few.js');
    const many = probsOf('many.js');
    expect(few).toHaveLength(2);
    expect(many).toHaveLength(20);
    // Every high-fan-out edge is damped strictly below every low-fan-out edge.
    expect(Math.max(...many)).toBeLessThan(Math.min(...few));
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
        "handlers.js": "0 (5000/5000)",
        "index.js": "0 (772/772)",
        "index.qwik.mjs_ErrorBoundary_component_6VMZkqoH00Q.js": "2 (2140/2140)",
        "index.qwik.mjs_Form_form_onSubmit_5DbAsQLGGo4.js": "1 (697/697)",
        "index.qwik.mjs_Link_component_handlePrefetch_0xCNPioszTk.js": "2 (5000/9886)",
        "index.qwik.mjs_QwikRouterMockProvider_component_goto_dNtHVLGwESE.js": "2 (5000/9886)",
        "index.qwik.mjs_QwikRouterProvider_component_useStyles_BMutFDNOKhc.js": "3 (5000/9886)",
        "index.qwik.mjs_RouterOutlet_component_q56DrQcc9VE.js": "2 (2017/6903)",
        "index.qwik.mjs_routeActionQrl_action_submit_rufUrhffR5k.js": "1 (1983/1983)",
        "index.qwik.mjs_serverQrl_rpc_Nhj4Mq4ilm8.js": "1 (5000/9886)",
        "index.qwik.mjs_spaInit_event_3mjmVvTlJqo.js": "1 (5000/5000)",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_VjDx6RO4Kis.js": "3 (727/727)",
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js": "2 (3928/3928)",
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js": "2 (4658/9544)",
        "index.tsx_routes_component_vG0UuU4cNCg.js": "5 (4886/4886)",
        "layout.js": "0 (4886/4886)",
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js": "2 (4772/9658)",
        "preloader.js": "0 (5000/5000)",
        "qwik-router.js": "2 (4886/4886)",
        "root.js": "0 (4886/4886)",
        "root.tsx_root_component_9PcKHFjikV0.js": "2 (4886/9772)",
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js": "2 (4886/9772)",
        "src-vendor-lib-helper.ts.js": "0 (4886/4886)",
        "src-vendor-lib-libA.ts.js": "0 (465/5351)",
        "src-vendor-lib-libB.ts.js": "0 (4886/9772)",
      }
    `);

    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "index.js",
        -93,
        26,
        "index.qwik.mjs_ErrorBoundary_component_6VMZkqoH00Q.js",
        "index.qwik.mjs_Form_form_onSubmit_5DbAsQLGGo4.js",
        "index.qwik.mjs_Link_component_handlePrefetch_0xCNPioszTk.js",
        38,
        "index.qwik.mjs_QwikRouterMockProvider_component_goto_dNtHVLGwESE.js",
        38,
        "index.qwik.mjs_QwikRouterProvider_component_useStyles_BMutFDNOKhc.js",
        38,
        -92,
        29,
        -68,
        27,
        -63,
        0,
        -48,
        33,
        "index.qwik.mjs_routeActionQrl_action_submit_rufUrhffR5k.js",
        "index.qwik.mjs_RouterOutlet_component_q56DrQcc9VE.js",
        38,
        "index.qwik.mjs_serverQrl_rpc_Nhj4Mq4ilm8.js",
        38,
        "index.qwik.mjs_spaInit_event_3mjmVvTlJqo.js",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_VjDx6RO4Kis.js",
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js",
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js",
        38,
        "index.tsx_routes_component_vG0UuU4cNCg.js",
        -48,
        59,
        61,
        "layout.js",
        -93,
        36,
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js",
        38,
        "qwik-router.js",
        -84,
        9,
        -83,
        4,
        -78,
        5,
        20,
        -71,
        19,
        24,
        "root.js",
        -93,
        52,
        "root.tsx_root_component_9PcKHFjikV0.js",
        38,
        -93,
        56,
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js",
        38,
        "src-vendor-lib-helper.ts.js",
        "src-vendor-lib-libA.ts.js",
        58,
        "src-vendor-lib-libB.ts.js",
        58,
        "BjxcCeNQ9ak",
        -92,
        29,
        "eevMxFvmCM8",
        -68,
        36,
        "99K9SAWjPFQ",
        -92,
        29,
        "LopIayqLfMo",
        -76,
        9,
        "VjDx6RO4Kis",
        -91,
        25,
        "HEFxKy9cwuk",
        -92,
        29,
        "6VMZkqoH00Q",
        -68,
        3,
        "9PcKHFjikV0",
        -68,
        52,
        "9fcUDoGM9Wo",
        -76,
        9,
        "SHtFir1Ia94",
        -68,
        36,
        "cH9twROgaEg",
        -68,
        7,
        "dAo05yeFq1I",
        -68,
        56,
        "ds9jIPT1g9s",
        -68,
        27,
        "lTNqDDf58lI",
        -68,
        5,
        "m7u9ARcfDGU",
        -68,
        26,
        "q56DrQcc9VE",
        -68,
        20,
        "vG0UuU4cNCg",
        -92,
        29,
        "vXTAPbOW0Ig",
        -68,
        38,
        "0pasaG6nmEA",
        -68,
        27,
        "BMutFDNOKhc",
        -76,
        9,
        "Iyy38y0K3Hw",
        -92,
        29,
        "MOLFIZOhXmE",
        -68,
        36,
        "WOcPLNnm2is",
        -68,
        26,
        "3mjmVvTlJqo",
        -60,
        24,
        "5DbAsQLGGo4",
        -75,
        4,
        "Nhj4Mq4ilm8",
        -60,
        22,
        "rufUrhffR5k",
        -60,
        19,
        "0xCNPioszTk",
        -68,
        5,
        "1F0Ft5Y9bOI",
        -68,
        3,
        "ANY7TPAnAd8",
        -68,
        38,
        "BdwdOv10pp0",
        -76,
        9,
        "YCi2vDzuhns",
        -68,
        38,
        "dNtHVLGwESE",
        -68,
        7,
        "ep3t0fF0SDA",
        -92,
        29,
        "lWJp5Z4VtFs",
        -68,
        5,
        "s3XioIi2Huw",
        -76,
        9,
      ]
    `);
  });
});
