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
      -7,
      5,
      'sym2', // 18
      -7,
      11,
      'sym3', // 21
      -5,
      14,
    ]);
  });

  test('empty', () => {
    expect(convertManifestToBundleGraph({} as any)).toEqual([]);
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

  test('only a slow-to-download import graph shifts the preload probability', () => {
    const probabilityOf = (depTotal: number) =>
      convertManifestToBundleGraph({
        bundles: {
          'page.js': { size, total, dynamicImports: ['dep.js'], qrlImports: ['dep.js'] },
          'dep.js': { size, total: depTotal, interactivity: 3 },
        } as Record<string, QwikBundle>,
        mapping: {},
      } as QwikManifest)[1];

    expect(probabilityOf(5_000)).toBe(-7);
    expect(probabilityOf(50_000)).toBe(-8);
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
    expect(convertManifestToBundleGraph(manifest)).toEqual(['widget.js', 'sym1', -7, 0]);
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

  describe('added layout entry', () => {
    const entryOf = (graph: (string | number)[], name: string) => {
      const start = graph.indexOf(name);
      const end = graph.findIndex((item, index) => index > start && typeof item === 'string');
      return graph.slice(start + 1, end === -1 ? undefined : end);
    };
    const withLayoutAndRoute = () =>
      convertManifestToBundleGraph(
        fakeManifest,
        new Set([
          () => ({
            'docs/': { dynamicImports: ['transitive-dep.js'] },
            DocsLayout: { dynamicImports: ['transitive-dep.js'] },
          }),
        ])
      );

    test('keeps an added entry that no bundle imports', () => {
      expect(withLayoutAndRoute()).toContain('DocsLayout');
    });

    test("follows an added layout entry's bundles like a route's", () => {
      const graph = withLayoutAndRoute();

      expect(entryOf(graph, 'DocsLayout').length).toBeGreaterThan(0);
      expect(entryOf(graph, 'DocsLayout')).toEqual(entryOf(graph, 'docs/'));
    });
  });

  describe('event qrls and render chunks', () => {
    const component = { ctxKind: 'function', ctxName: 'component$' };
    const componentManifest = (cardEvent: { ctxKind: string; ctxName: string }) =>
      ({
        bundles: {
          'card.js': { size, total, qrlImports: ['card-render.js'] },
          'card-render.js': {
            size,
            total,
            imports: ['row.js'],
            qrlImports: ['card-events.js'],
            symbols: ['card_component_CARD'],
          },
          'card-events.js': {
            size,
            total,
            symbols: ['card_event_EVENT'],
            interactivity: cardEvent.ctxName === 'onClick$' ? 5 : 2,
          },
          'row.js': { size, total, qrlImports: ['row-render.js', 'row-shared-qrl.js'] },
          'row-render.js': {
            size,
            total,
            imports: ['row.js'],
            qrlImports: ['row-events.js', 'cell-render.js'],
            symbols: ['row_component_ROW'],
          },
          'row-events.js': { size, total, symbols: ['row_useTask_TASK'] },
          'row-shared-qrl.js': { size, total, symbols: ['row_shared_SHARED'] },
          'cell-render.js': {
            size,
            total,
            qrlImports: ['cell-events.js'],
            symbols: ['cell_component_CELL'],
          },
          'cell-events.js': { size, total, symbols: ['cell_onClick_CLICK'] },
        },
        mapping: {
          card_component_CARD: 'card-render.js',
          card_event_EVENT: 'card-events.js',
          row_component_ROW: 'row-render.js',
          row_useTask_TASK: 'row-events.js',
          row_shared_SHARED: 'row-shared-qrl.js',
          cell_component_CELL: 'cell-render.js',
          cell_onClick_CLICK: 'cell-events.js',
        },
        symbols: {
          card_component_CARD: component,
          card_event_EVENT: cardEvent,
          row_component_ROW: component,
          row_useTask_TASK: { ctxKind: 'function', ctxName: 'useTask$' },
          row_shared_SHARED: { ctxKind: 'function', ctxName: '$' },
          cell_component_CELL: component,
          cell_onClick_CLICK: { ctxKind: 'eventHandler', ctxName: 'onClick$' },
        },
      }) as unknown as QwikManifest;

    const likelihoodsFrom = (manifest: QwikManifest, start: string) => {
      const graph = convertManifestToBundleGraph(manifest);
      const likelihoods = new Map<string, number>();
      const visit = (name: string, likelihood: number) => {
        if ((likelihoods.get(name) ?? 0) >= likelihood) {
          return;
        }
        likelihoods.set(name, likelihood);
        let edge = 1;
        for (let i = graph.indexOf(name) + 1; typeof graph[i] === 'number'; i++) {
          const item = graph[i] as number;
          if (item < 0) {
            edge = -item / 10;
          } else {
            visit(graph[item] as string, likelihood * edge);
          }
        }
      };
      visit(start, 1);
      return likelihoods;
    };

    const onClick = { ctxKind: 'eventHandler', ctxName: 'onClick$' };
    const onInput = { ctxKind: 'eventHandler', ctxName: 'onInput$' };

    test("ranks a component's event QRL chunk above its render chunk", () => {
      const likelihoods = likelihoodsFrom(componentManifest(onClick), 'card.js');

      expect(likelihoods.get('card-events.js')).toBeGreaterThan(likelihoods.get('card-render.js')!);
    });

    test("ranks a child component's event QRL chunk above its parent's render chunk", () => {
      const likelihoods = likelihoodsFrom(componentManifest(onClick), 'card.js');

      expect(likelihoods.get('row-events.js')).toBeGreaterThan(likelihoods.get('card-render.js')!);
    });

    test("ranks a child component's event QRL chunk above the child's render chunk", () => {
      const likelihoods = likelihoodsFrom(componentManifest(onClick), 'card.js');

      expect(likelihoods.get('row-events.js')).toBeGreaterThan(likelihoods.get('row-render.js')!);
    });

    test("ranks the event QRL chunk of a component declared in its parent's file above every render chunk", () => {
      const likelihoods = likelihoodsFrom(componentManifest(onClick), 'card.js');

      expect(likelihoods.get('cell-events.js')).toBeGreaterThan(likelihoods.get('card-render.js')!);
    });

    test('ranks a QRL that a child component uses from the top of its own file above every render chunk', () => {
      const likelihoods = likelihoodsFrom(componentManifest(onClick), 'card.js');

      expect(likelihoods.get('row-shared-qrl.js')).toBeGreaterThan(
        likelihoods.get('card-render.js')!
      );
    });

    test("ranks a child component's module with the render chunks, below the event QRLs", () => {
      const likelihoods = likelihoodsFrom(componentManifest(onClick), 'card.js');

      expect(likelihoods.get('row.js')).toBe(likelihoods.get('card-render.js'));
      expect(likelihoods.get('row.js')).toBeLessThan(likelihoods.get('row-events.js')!);
    });

    test('ranks every kind of handler the same', () => {
      const withClick = likelihoodsFrom(componentManifest(onClick), 'card.js');
      const withInput = likelihoodsFrom(componentManifest(onInput), 'card.js');

      expect(withInput.get('card-events.js')).toBe(withClick.get('card-events.js'));
    });
  });

  test(`works`, () => {
    // The fixture keeps only the first 5000 bytes of each chunk's code, which drops its import()
    // calls; write them over the tail so the sizes stay the same.
    const bundles = Object.fromEntries(
      Object.entries(outputBundles.bundles).map(([name, bundle]: [string, any]) => {
        const imports = (bundle.dynamicImports ?? [])
          .map((file: string) => `import("./${file.slice(file.lastIndexOf('/') + 1)}");`)
          .join('');
        const code: string = bundle.code ?? '';
        return [
          name,
          { ...bundle, code: code.slice(0, Math.max(0, code.length - imports.length)) + imports },
        ];
      })
    );
    const manifest = generateManifestFromBundles(
      path as any,
      outputBundles.segments as any,
      [],
      bundles as any,
      { rootDir: '/', outDir: '/' } as any,
      console.error,
      (p) => path.relative('build', p),
      (id) => {
        const info = (outputBundles.moduleInfo as Record<string, any>)[id];
        return (
          info && ({ dynamicallyImportedIds: [], ...info, meta: { segment: info.segment } } as any)
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
        "index.tsx_routes_component_vG0UuU4cNCg.js": "3 (4886/4886)",
        "layout.js": "0 (4886/4886)",
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js": "3 (4772/9658)",
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
        -5,
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
        -10,
        25,
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js",
        27,
        "qwik-router.js",
        -10,
        4,
        5,
        16,
        9,
        11,
        -5,
        12,
        "root.js",
        -10,
        91,
        107,
        -5,
        42,
        "root.tsx_root_component_9PcKHFjikV0.js",
        27,
        -10,
        107,
        -5,
        48,
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js",
        27,
        "src-vendor-lib-helper.ts.js",
        "src-vendor-lib-libA.ts.js",
        50,
        "src-vendor-lib-libB.ts.js",
        50,
        "BjxcCeNQ9ak",
        -10,
        21,
        "eevMxFvmCM8",
        -10,
        25,
        "99K9SAWjPFQ",
        -10,
        21,
        "LopIayqLfMo",
        -10,
        9,
        "VjDx6RO4Kis",
        -10,
        17,
        "HEFxKy9cwuk",
        -10,
        21,
        "6VMZkqoH00Q",
        -10,
        3,
        "9PcKHFjikV0",
        -10,
        91,
        107,
        -5,
        42,
        "9fcUDoGM9Wo",
        -10,
        9,
        "SHtFir1Ia94",
        -10,
        25,
        "cH9twROgaEg",
        -10,
        7,
        "dAo05yeFq1I",
        -10,
        107,
        -5,
        48,
        "ds9jIPT1g9s",
        -10,
        107,
        -5,
        19,
        "lTNqDDf58lI",
        -10,
        5,
        "m7u9ARcfDGU",
        -5,
        18,
        "q56DrQcc9VE",
        -10,
        4,
        5,
        16,
        9,
        11,
        -5,
        12,
        "vG0UuU4cNCg",
        -10,
        21,
        "vXTAPbOW0Ig",
        -10,
        27,
        "0pasaG6nmEA",
        -10,
        107,
        -5,
        19,
        "BMutFDNOKhc",
        -10,
        9,
        "Iyy38y0K3Hw",
        -10,
        21,
        "MOLFIZOhXmE",
        -10,
        25,
        "WOcPLNnm2is",
        -5,
        18,
        "3mjmVvTlJqo",
        -10,
        16,
        "5DbAsQLGGo4",
        -10,
        4,
        "Nhj4Mq4ilm8",
        -10,
        14,
        "rufUrhffR5k",
        -10,
        11,
        "0xCNPioszTk",
        -10,
        5,
        "1F0Ft5Y9bOI",
        -10,
        3,
        "ANY7TPAnAd8",
        -10,
        27,
        "BdwdOv10pp0",
        -10,
        9,
        "YCi2vDzuhns",
        -10,
        27,
        "dNtHVLGwESE",
        -10,
        7,
        "ep3t0fF0SDA",
        -10,
        21,
        "lWJp5Z4VtFs",
        -10,
        5,
        "s3XioIi2Huw",
        -10,
        9,
      ]
    `);
  });
});
