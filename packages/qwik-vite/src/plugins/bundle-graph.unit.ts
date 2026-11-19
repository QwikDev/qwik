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

  describe('chunk kinds', () => {
    const HANDLER = -2;
    const QRL = -3;
    const COMPONENT = -4;
    const symbols = {
      click_CLICK: { ctxKind: 'eventHandler', ctxName: 'onClick$' },
      prop_PROP: { ctxKind: 'jSXProp', ctxName: 'ActionButton' },
      task_TASK: { ctxKind: 'function', ctxName: 'useTask$' },
      computed_COMPUTED: { ctxKind: 'function', ctxName: 'useComputed$' },
      inline_INLINE: { ctxKind: 'function', ctxName: '$' },
      card_CARD: { ctxKind: 'function', ctxName: 'component$' },
      styles_STYLES: { ctxKind: 'function', ctxName: 'useStylesScoped$' },
    };
    const kindOfChunkWith = (chunkSymbols: string[]) => {
      const graph = convertManifestToBundleGraph({
        bundles: {
          'page.js': { size, total, dynamicImports: ['chunk.js'], qrlImports: ['chunk.js'] },
          'chunk.js': { size, total, symbols: chunkSymbols },
        },
        mapping: {},
        symbols,
      } as unknown as QwikManifest);
      return graph[graph.indexOf('chunk.js') + 1];
    };

    test('marks a chunk that holds a handler as a handler chunk', () => {
      expect(kindOfChunkWith(['click_CLICK'])).toBe(HANDLER);
    });

    test('a QRL passed to a component as a prop counts as a handler', () => {
      expect(kindOfChunkWith(['prop_PROP'])).toBe(HANDLER);
    });

    test('marks a chunk that holds only tasks, computeds or inline QRLs as a QRL chunk', () => {
      expect(kindOfChunkWith(['task_TASK', 'computed_COMPUTED', 'inline_INLINE'])).toBe(QRL);
    });

    test('marks a chunk that holds only a render function or styles as a component chunk', () => {
      expect(kindOfChunkWith(['card_CARD', 'styles_STYLES'])).toBe(COMPONENT);
    });

    test('a chunk that holds a handler and a task counts as a handler chunk', () => {
      expect(kindOfChunkWith(['task_TASK', 'click_CLICK'])).toBe(HANDLER);
      expect(kindOfChunkWith(['card_CARD', 'task_TASK'])).toBe(QRL);
    });

    test('leaves a chunk with no QRL unmarked', () => {
      expect(kindOfChunkWith([])).toBeUndefined();
    });
  });

  test('trivial example', () => {
    expect(convertManifestToBundleGraph(fakeManifest)).toEqual([
      'app.js', // 0
      2,
      'static-dep.js', // 2
      -1,
      5,
      // doesn't list 13 because it's also statically imported by dynamic-dep.js
      'dynamic-dep.js', // 5
      2,
      10,
      -1,
      11,
      // boring-dep.js is not listed: a user import() is not a qrl edge
      'transitive-dep.js', // 10
      'has-a-symbol.js', // 11
      -1,
      14,
      'large-file.js', // 14
      'sym1', // 15
      -1,
      5,
      'sym2', // 18
      -1,
      11,
      'sym3', // 21
      -1,
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
      -1,
      7,
      'b.js', // 4
      -1,
      7,
      'c.js', // 7
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
      -1,
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
    expect(convertManifestToBundleGraph(manifest)).toEqual(['widget.js', 'sym1', -1, 0]);
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
      -1,
      5,
      'dynamic-dep.js', // 5
      2,
      8,
      'transitive-dep.js', // 8
      'has-a-symbol.js', // 9
      -1,
      12,
      'large-file.js', // 12
      'sym1', // 13
      -1,
      5,
      'sym2', // 16
      -1,
      9,
      'sym3', // 19
      -1,
      12,
      'dashboard/', // 22
      2,
      -1,
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

    expect(convertManifestToBundleGraph(manifest)).toMatchInlineSnapshot(`
      [
        "index.js",
        -1,
        28,
        "index.qwik.mjs_ErrorBoundary_component_6VMZkqoH00Q.js",
        -3,
        "index.qwik.mjs_Form_form_onSubmit_5DbAsQLGGo4.js",
        -3,
        "index.qwik.mjs_Link_component_handlePrefetch_0xCNPioszTk.js",
        -3,
        41,
        "index.qwik.mjs_QwikRouterMockProvider_component_goto_dNtHVLGwESE.js",
        -3,
        41,
        "index.qwik.mjs_QwikRouterProvider_component_useStyles_BMutFDNOKhc.js",
        -3,
        41,
        "index.qwik.mjs_routeActionQrl_action_submit_rufUrhffR5k.js",
        -3,
        "index.qwik.mjs_RouterOutlet_component_q56DrQcc9VE.js",
        -4,
        41,
        "index.qwik.mjs_serverQrl_rpc_Nhj4Mq4ilm8.js",
        -3,
        41,
        "index.qwik.mjs_spaInit_event_3mjmVvTlJqo.js",
        -3,
        "index.qwik.mjs_usePreventNavigateQrl_useVisibleTask_VjDx6RO4Kis.js",
        -3,
        "index.tsx_about_component_useStyles_WOcPLNnm2is.js",
        -4,
        "index.tsx_form_component_useStyles_0pasaG6nmEA.js",
        -4,
        41,
        "index.tsx_routes_component_vG0UuU4cNCg.js",
        -2,
        "layout.js",
        -1,
        38,
        "layout.tsx_layout_component_useStyles_MOLFIZOhXmE.js",
        -2,
        41,
        "qwik-router.js",
        -3,
        -1,
        5,
        7,
        24,
        13,
        18,
        16,
        "root.js",
        -1,
        53,
        "root.tsx_root_component_9PcKHFjikV0.js",
        -4,
        41,
        -1,
        58,
        "router-head.tsx_RouterHead_component_dAo05yeFq1I.js",
        -4,
        41,
        "src-vendor-lib-helper.ts.js",
        "src-vendor-lib-libA.ts.js",
        61,
        "src-vendor-lib-libB.ts.js",
        61,
        "BjxcCeNQ9ak",
        -1,
        33,
        "eevMxFvmCM8",
        -1,
        38,
        "99K9SAWjPFQ",
        -1,
        33,
        "LopIayqLfMo",
        -1,
        13,
        "VjDx6RO4Kis",
        -1,
        26,
        "HEFxKy9cwuk",
        -1,
        33,
        "6VMZkqoH00Q",
        -1,
        3,
        "9PcKHFjikV0",
        -1,
        53,
        "9fcUDoGM9Wo",
        -1,
        13,
        "SHtFir1Ia94",
        -1,
        38,
        "cH9twROgaEg",
        -1,
        10,
        "dAo05yeFq1I",
        -1,
        58,
        "ds9jIPT1g9s",
        -1,
        30,
        "lTNqDDf58lI",
        -1,
        7,
        "m7u9ARcfDGU",
        -1,
        28,
        "q56DrQcc9VE",
        -1,
        18,
        "vG0UuU4cNCg",
        -1,
        33,
        "vXTAPbOW0Ig",
        -1,
        41,
        "0pasaG6nmEA",
        -1,
        30,
        "BMutFDNOKhc",
        -1,
        13,
        "Iyy38y0K3Hw",
        -1,
        33,
        "MOLFIZOhXmE",
        -1,
        38,
        "WOcPLNnm2is",
        -1,
        28,
        "3mjmVvTlJqo",
        -1,
        24,
        "5DbAsQLGGo4",
        -1,
        5,
        "Nhj4Mq4ilm8",
        -1,
        21,
        "rufUrhffR5k",
        -1,
        16,
        "0xCNPioszTk",
        -1,
        7,
        "1F0Ft5Y9bOI",
        -1,
        3,
        "ANY7TPAnAd8",
        -1,
        41,
        "BdwdOv10pp0",
        -1,
        13,
        "YCi2vDzuhns",
        -1,
        41,
        "dNtHVLGwESE",
        -1,
        10,
        "ep3t0fF0SDA",
        -1,
        33,
        "lWJp5Z4VtFs",
        -1,
        7,
        "s3XioIi2Huw",
        -1,
        13,
      ]
    `);
  });
});
