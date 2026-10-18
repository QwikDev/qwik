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
        qrlImports: ['transitive-dep.js', 'dynamic-dep.js'],
      },
      'dynamic-dep.js': {
        size,
        total,
        imports: ['static-dep.js', 'transitive-dep.js', '@external-dep'],
        dynamicImports: ['has-a-symbol.js', 'boring-dep.js', 'no-symbols.js'],
        qrlImports: ['has-a-symbol.js'],
        origins: ['dynamic-dep.js'],
        symbols: ['sym1'],
      },
      'transitive-dep.js': { size, total, symbols: ['sym4'] },
      'not-used.js': { size, total },
      'has-a-symbol.js': {
        size,
        total,
        dynamicImports: ['large-file.js'],
        qrlImports: ['large-file.js'],
        symbols: ['sym2'],
        origins: ['dynamic-dep.js_handleClick_sym2.js'],
      },
      'no-symbols.js': { size, total },
      // only reached by a user import()
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
      10,
      -9,
      11,
      // boring-dep.js is not listed: a user import() is not a qrl edge
      'transitive-dep.js', // 10
      'has-a-symbol.js', // 11
      -5,
      14,
      'large-file.js', // 14
      'sym1', // 15
      5,
      'sym2', // 17
      11,
      'sym3', // 19
      14,
    ]);
  });

  test('empty', () => {
    expect(convertManifestToBundleGraph({} as any)).toEqual([]);
  });

  test('prepares transitive render dependencies without future handlers', () => {
    const manifest = {
      bundles: {
        'route.js': {
          size,
          total,
          qrlImports: ['render.js', 'click.js'],
          renderImports: ['render.js'],
        },
        'render.js': {
          size,
          total,
          qrlImports: ['child.js', 'submit.js'],
          renderImports: ['child.js'],
        },
        'child.js': { size, total },
        'click.js': { size, total, imports: ['lightbox.js'] },
        'submit.js': { size, total },
        'lightbox.js': { size, total },
      },
      mapping: { s_click: 'click.js' },
    } as unknown as QwikManifest;
    const graph = convertManifestToBundleGraph(manifest);
    const dependencies = (name: string) => {
      const start = graph.indexOf(name) + 1;
      const result: string[] = [];
      for (let i = start; typeof graph[i] === 'number'; i++) {
        if ((graph[i] as number) >= 0) result.push(graph[graph[i] as number] as string);
      }
      return result;
    };
    expect(dependencies('route.js')).toEqual(['render.js']);
    expect(graph[graph.indexOf('route.js') + 1]).toBe(-17);
    expect(dependencies('render.js')).toEqual(['child.js']);
    expect(dependencies('click')).toEqual(['click.js']);
    expect(dependencies('click.js')).toEqual(['lightbox.js']);
  });

  test('records render-time QRL imports separately from event callbacks', () => {
    const chunks = Object.fromEntries(
      ['entry', 'render', 'click', 'task', 'computed', 'visible'].map((name) => [
        `${name}.js`,
        {
          type: 'chunk',
          fileName: `${name}.js`,
          name,
          code: '',
          exports: [],
          imports: [],
          dynamicImports:
            name === 'entry'
              ? ['render.js', 'click.js', 'task.js', 'computed.js', 'visible.js']
              : [],
          modules: { [name]: {} },
        },
      ])
    );
    const contexts: Record<string, string> = {
      render: 'component$',
      click: '$',
      task: 'useTask$',
      computed: 'createComputed$',
      visible: 'useVisibleTask$',
    };
    const manifest = generateManifestFromBundles(
      path as any,
      [],
      [],
      chunks as any,
      { rootDir: '/', outDir: '/' } as any,
      console.error,
      (name) => name,
      (id) =>
        ({
          dynamicallyImportedIds: id === 'entry' ? Object.keys(contexts) : [],
          meta: contexts[id] ? { segment: { ctxKind: 'function', ctxName: contexts[id] } } : {},
        }) as any
    );
    expect(manifest.bundles['entry.js'].qrlImports).toEqual([
      'render.js',
      'click.js',
      'task.js',
      'computed.js',
      'visible.js',
    ]);
    expect((manifest.bundles['entry.js'] as any).renderImports).toEqual([
      'render.js',
      'task.js',
      'computed.js',
    ]);
  });

  test('preserves render order and repeated probability markers', () => {
    const manifest = {
      bundles: {
        'root.js': { size, total, renderImports: ['first.js', 'second.js', 'last.js'] },
        'first.js': { size, total },
        'second.js': { size, total, interactivity: 3 },
        'last.js': { size, total },
      },
      mapping: {},
    } as unknown as QwikManifest;
    expect(convertManifestToBundleGraph(manifest)).toEqual([
      'root.js',
      -17,
      7,
      -19,
      8,
      -17,
      9,
      'first.js',
      'second.js',
      'last.js',
    ]);
  });

  test('symbol hints inherit priority without making their target speculative', () => {
    const manifest = {
      bundles: { 'handler.js': { size, total } },
      mapping: { s_handler: 'handler.js' },
    } as unknown as QwikManifest;
    expect(convertManifestToBundleGraph(manifest)).toEqual(['handler.js', 'handler', 0]);
  });

  test('simple file set', () => {
    const manifest = {
      bundles: {
        'a.js': { size, total, imports: ['b.js'], dynamicImports: ['c.js'], qrlImports: ['c.js'] },
        'b.js': { size, total, dynamicImports: ['c.js'], qrlImports: ['c.js'] },
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

  test('does not round speculative dynamic imports to guaranteed dependencies', () => {
    const manifest = {
      bundles: {
        'app.js': {
          size,
          total,
          imports: ['static.js'],
          dynamicImports: ['interactive.js'],
          qrlImports: ['interactive.js'],
        },
        'static.js': { size, total },
        'interactive.js': { size, total, interactivity: 5 },
      } as Record<string, QwikBundle>,
      mapping: {},
    } as QwikManifest;

    expect(convertManifestToBundleGraph(manifest)).toEqual([
      'app.js',
      4,
      -9,
      5,
      'static.js',
      'interactive.js',
    ]);
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
    expect(convertManifestToBundleGraph(manifest)).toEqual([
      'x.js', // 0
      3,
      5,
      'a.js', // 3
      0,
      'd.js', // 5
    ]);
  });

  test('import cycle keeps dynamic deps but still reduces them', () => {
    const manifest = {
      bundles: {
        'x.js': {
          size,
          total,
          imports: ['a.js'],
          dynamicImports: ['a.js', 'd.js', 'e.js'],
          qrlImports: ['a.js', 'd.js', 'e.js'],
        },
        'a.js': { size, total, imports: ['x.js'], symbols: ['sym1'] },
        'd.js': { size, total, symbols: ['sym2'] },
        'e.js': { size, total, imports: ['d.js'], symbols: ['sym3'] },
      } as Record<string, QwikBundle>,
      mapping: {},
    } as QwikManifest;
    expect(convertManifestToBundleGraph(manifest)).toEqual([
      'x.js', // 0
      4,
      -7,
      7,
      'a.js', // 4
      0,
      'd.js', // 6
      'e.js', // 7
      6,
    ]);
  });

  test('user dynamic import is not followed', () => {
    const manifest = {
      bundles: {
        'page.js': { size, total, dynamicImports: ['widget.js'] },
        'widget.js': { size, total, symbols: ['sym1'] },
      } as Record<string, QwikBundle>,
      mapping: { sym1: 'widget.js' },
      symbols: {},
    } as unknown as QwikManifest;
    // widget.js stays reachable only through its symbol
    expect(convertManifestToBundleGraph(manifest)).toEqual(['widget.js', 'sym1', 0]);
  });

  test('explicit adder imports override inferred render filtering', () => {
    const manifest = {
      bundles: {
        'config.js': { size, total, dynamicImports: ['other.js', 'menu.js'], renderImports: [] },
        'other.js': { size, total },
        'menu.js': { size, total },
      },
      mapping: {},
    } as unknown as QwikManifest;
    expect(
      convertManifestToBundleGraph(
        manifest,
        new Set([
          (m) => ({
            'config.js': { ...m.bundles['config.js'], dynamicImports: ['menu.js'] },
          }),
        ])
      )
    ).toEqual(['config.js', -7, 3, 'menu.js']);
  });

  test('static adder changes preserve inferred render filtering', () => {
    const manifest = {
      bundles: {
        'config.js': { size, total, dynamicImports: ['unused.js'], renderImports: [] },
        'helper.js': { size, total },
        'unused.js': { size, total },
      },
      mapping: {},
    } as unknown as QwikManifest;
    expect(
      convertManifestToBundleGraph(
        manifest,
        new Set([
          (m) => ({
            'config.js': { ...m.bundles['config.js'], imports: ['helper.js'] },
          }),
        ])
      )
    ).toEqual(['config.js', 2, 'helper.js']);
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
      5,
      'sym2', // 15
      9,
      'sym3', // 17
      12,
      'dashboard/', // 19
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
      (p) => path.relative('build', p),
      (id) => {
        const info = (outputBundles.moduleInfo as Record<string, any>)[id];
        return (
          info &&
          ({
            dynamicallyImportedIds: [],
            ...info,
            meta: {
              segment:
                info.segment &&
                outputBundles.segments.find((segment) =>
                  id.endsWith(`/${segment.canonicalFilename}.js`)
                ),
            },
          } as any)
        );
      }
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
        -19,
        18,
        "index.qwik.mjs_ErrorBoundary_component_6VMZkqoH00Q.js",
        "index.qwik.mjs_Form_form_onSubmit_5DbAsQLGGo4.js",
        "index.qwik.mjs_Link_component_handlePrefetch_0xCNPioszTk.js",
        27,
        "index.qwik.mjs_QwikRouterMockProvider_component_goto_dNtHVLGwESE.js",
        27,
        "index.qwik.mjs_QwikRouterProvider_component_useStyles_BMutFDNOKhc.js",
        27,
        "index.qwik.mjs_routeActionQrl_action_submit_rufUrhffR5k.js",
        "index.qwik.mjs_RouterOutlet_component_q56DrQcc9VE.js",
        27,
        "index.qwik.mjs_serverQrl_rpc_Nhj4Mq4ilm8.js",
        27,
        "index.qwik.mjs_spaInit_event_3mjmVvTlJqo.js",
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_VjDx6RO4Kis.js",
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js",
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js",
        27,
        "index.tsx_routes_component_vG0UuU4cNCg.js",
        "layout.js",
        -19,
        25,
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js",
        27,
        "qwik-router.js",
        -19,
        5,
        9,
        12,
        "root.js",
        -19,
        35,
        "root.tsx_root_component_9PcKHFjikV0.js",
        27,
        -19,
        39,
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js",
        27,
        "src-vendor-lib-helper.ts.js",
        "src-vendor-lib-libA.ts.js",
        41,
        "src-vendor-lib-libB.ts.js",
        41,
        "BjxcCeNQ9ak",
        21,
        "eevMxFvmCM8",
        25,
        "99K9SAWjPFQ",
        21,
        "LopIayqLfMo",
        9,
        "VjDx6RO4Kis",
        17,
        "HEFxKy9cwuk",
        21,
        "6VMZkqoH00Q",
        3,
        "9PcKHFjikV0",
        35,
        "9fcUDoGM9Wo",
        9,
        "SHtFir1Ia94",
        25,
        "cH9twROgaEg",
        7,
        "dAo05yeFq1I",
        39,
        "ds9jIPT1g9s",
        19,
        "lTNqDDf58lI",
        5,
        "m7u9ARcfDGU",
        18,
        "q56DrQcc9VE",
        12,
        "vG0UuU4cNCg",
        21,
        "vXTAPbOW0Ig",
        27,
        "0pasaG6nmEA",
        19,
        "BMutFDNOKhc",
        9,
        "Iyy38y0K3Hw",
        21,
        "MOLFIZOhXmE",
        25,
        "WOcPLNnm2is",
        18,
        "3mjmVvTlJqo",
        16,
        "5DbAsQLGGo4",
        4,
        "Nhj4Mq4ilm8",
        14,
        "rufUrhffR5k",
        11,
        "0xCNPioszTk",
        5,
        "1F0Ft5Y9bOI",
        3,
        "ANY7TPAnAd8",
        27,
        "BdwdOv10pp0",
        9,
        "YCi2vDzuhns",
        27,
        "dNtHVLGwESE",
        7,
        "ep3t0fF0SDA",
        21,
        "lWJp5Z4VtFs",
        5,
        "s3XioIi2Huw",
        9,
      ]
    `);
  });
});
