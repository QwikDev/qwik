import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { computeTotals, generateManifestFromBundles } from './manifest';
import type { QwikBundle } from './types';

describe('generateManifestFromBundles', () => {
  const chunk = (name: string, fileName: string, moduleIds: string[] = []) => ({
    type: 'chunk' as const,
    name,
    fileName,
    code: '',
    exports: [],
    imports: [],
    dynamicImports: [],
    moduleIds,
    modules: {},
  });

  const generate = (
    bundles: Record<string, ReturnType<typeof chunk>>,
    qwikLoaderFileName?: string,
    preloaderFileName?: string,
    handlersFileName?: string
  ) =>
    generateManifestFromBundles(
      path as any,
      [],
      [],
      bundles as any,
      { rootDir: '/', outDir: '/' } as any,
      () => {},
      (p) => p,
      () => null,
      qwikLoaderFileName,
      preloaderFileName,
      handlersFileName
    );

  test('identifies core/preloader by group name and the loader by its emit file name', () => {
    const manifest = generate(
      {
        'q-core.js': chunk('qwik-core', 'q-core.js', [
          '/app/node_modules/@qwik.dev/core/dist/core.prod.mjs',
          '/app/node_modules/@qwik.dev/core/handlers.mjs',
        ]),
        'q-loader.js': chunk('qwikloader', 'q-loader.js'),
        'q-preloader.js': chunk('qwik-preloader', 'q-preloader.js'),
        'q-app.js': chunk('app', 'q-app.js'),
      },
      'q-loader.js'
    );

    expect(manifest.core).toBe('q-core.js');
    expect(manifest.qwikLoader).toBe('q-loader.js');
    expect(manifest.preloader).toBe('q-preloader.js');
    expect(manifest.mapping['_run']).toBe('q-core.js');
    expect(manifest.symbols['_run']?.origin).toBe('Qwik core');
  });

  test('emitted preloader and handlers facades win over the group chunks', () => {
    const manifest = generate(
      {
        'q-core.js': chunk('qwik-core', 'q-core.js', [
          '/app/node_modules/@qwik.dev/core/dist/core.prod.mjs',
        ]),
        'q-preloader.js': chunk('qwik-preloader', 'q-preloader.js'),
        'preloader.js': chunk('preloader', 'preloader.js'),
        'handlers.js': chunk('handlers', 'handlers.js'),
      },
      undefined,
      'preloader.js',
      'handlers.js'
    );

    expect(manifest.core).toBe('q-core.js');
    expect(manifest.preloader).toBe('preloader.js');
    expect(manifest.mapping['_run']).toBe('handlers.js');
  });

  test('falls back to the group chunk when the emitted entry was merged into it', () => {
    const manifest = generate(
      {
        'q-core.js': chunk('qwik-core', 'q-core.js', [
          '/app/node_modules/@qwik.dev/core/dist/core.prod.mjs',
        ]),
        'q-preloader.js': chunk('qwik-preloader', 'q-preloader.js'),
      },
      undefined,
      'build/preloader.js',
      'build/handlers.js'
    );

    expect(manifest.preloader).toBe('q-preloader.js');
    expect(manifest.mapping['_run']).toBe('q-core.js');
  });

  test('a user route named "qwikloader" does not shadow the real loader chunk', () => {
    const manifest = generate(
      {
        'q-loader.js': chunk('qwikloader', 'q-loader.js'),
        'q-route.js': chunk('qwikloader', 'q-route.js'),
      },
      'q-loader.js'
    );

    expect(manifest.qwikLoader).toBe('q-loader.js');
  });

  test('records only segment dynamic imports as qrlImports', () => {
    const page = {
      ...chunk('page', 'page.js'),
      code: 'qrl(() => import("./seg.js")); import("./lib.js");',
      modules: { '/app/page.tsx': {} },
    };
    page.dynamicImports = ['seg.js', 'lib.js'];
    const manifest = generateManifestFromBundles(
      path as any,
      [],
      [],
      {
        'page.js': page,
        'seg.js': { ...chunk('seg', 'seg.js'), modules: { '/app/page.tsx_seg.js': {} } },
        'lib.js': { ...chunk('lib', 'lib.js'), modules: { '/app/lib.ts': {} } },
      } as any,
      { rootDir: '/', outDir: '/' } as any,
      () => {},
      (p) => p,
      (id) =>
        id === '/app/page.tsx'
          ? ({ dynamicallyImportedIds: ['/app/page.tsx_seg.js', '/app/lib.ts'], meta: {} } as any)
          : ({ dynamicallyImportedIds: [], meta: { segment: id.includes('_seg') } } as any)
    );
    expect(manifest.bundles['page.js'].dynamicImports).toEqual(['lib.js', 'seg.js']);
    expect(manifest.bundles['page.js'].qrlImports).toEqual(['seg.js']);
  });

  test('points a qrl import of a re-exported segment at the facade chunk that exports it', () => {
    // A segment like `$(importedFn)` lives in a group chunk; only its facade exports the symbol.
    const page = {
      ...chunk('page', 'page.js'),
      code: 'qrl(() => import("./seg-entry.js"));',
      modules: { '/app/page.tsx': {} },
    };
    page.dynamicImports = ['seg-entry.js'];
    const manifest = generateManifestFromBundles(
      path as any,
      [],
      [],
      {
        'page.js': page,
        'seg-entry.js': {
          ...chunk('seg', 'seg-entry.js'),
          imports: ['group.js'],
          facadeModuleId: '/app/page.tsx_seg.js',
        },
        'group.js': { ...chunk('group', 'group.js'), modules: { '/app/page.tsx_seg.js': {} } },
      } as any,
      { rootDir: '/', outDir: '/' } as any,
      () => {},
      (p) => p,
      (id) =>
        id === '/app/page.tsx'
          ? ({ dynamicallyImportedIds: ['/app/page.tsx_seg.js'], meta: {} } as any)
          : ({ dynamicallyImportedIds: [], meta: { segment: true } } as any)
    );
    expect(manifest.bundles['page.js'].qrlImports).toEqual(['seg-entry.js']);
    expect(manifest.bundles['seg-entry.js'].origins).toEqual([path.join('app', 'page.tsx_seg.js')]);
  });

  test('leaves out dynamic imports that tree-shaking removed from the code', () => {
    // A library exports two components; the app uses only one, so the other's qrl() is gone.
    const lib = {
      ...chunk('lib', 'lib.js'),
      code: 'export const Used = componentQrl(qrl(() => import("./used.js"), "s_used"));',
      modules: { '/lib/index.qwik.mjs': {} },
    };
    lib.dynamicImports = ['used.js', 'unused.js'];
    const manifest = generateManifestFromBundles(
      path as any,
      [],
      [],
      {
        'lib.js': lib,
        'used.js': { ...chunk('used', 'used.js'), modules: { '/lib/index.qwik.mjs_used.js': {} } },
        'unused.js': {
          ...chunk('unused', 'unused.js'),
          modules: { '/lib/index.qwik.mjs_unused.js': {} },
        },
      } as any,
      { rootDir: '/', outDir: '/' } as any,
      () => {},
      (p) => p,
      (id) =>
        id === '/lib/index.qwik.mjs'
          ? ({
              dynamicallyImportedIds: [
                '/lib/index.qwik.mjs_used.js',
                '/lib/index.qwik.mjs_unused.js',
              ],
              meta: {},
            } as any)
          : ({ dynamicallyImportedIds: [], meta: { segment: true } } as any)
    );
    expect(manifest.bundles['lib.js'].dynamicImports).toEqual(['used.js']);
    expect(manifest.bundles['lib.js'].qrlImports).toEqual(['used.js']);
  });

  test("does not keep an import whose file name ends another import's file name", () => {
    const lib = {
      ...chunk('lib', 'lib.js'),
      code: 'export const Unused = componentQrl(qrl(() => import("./unused.js"), "s_unused"));',
      modules: { '/lib/index.qwik.mjs': {} },
    };
    lib.dynamicImports = ['used.js', 'unused.js'];
    const manifest = generateManifestFromBundles(
      path as any,
      [],
      [],
      {
        'lib.js': lib,
        'used.js': { ...chunk('used', 'used.js'), modules: { '/lib/index.qwik.mjs_used.js': {} } },
        'unused.js': {
          ...chunk('unused', 'unused.js'),
          modules: { '/lib/index.qwik.mjs_unused.js': {} },
        },
      } as any,
      { rootDir: '/', outDir: '/' } as any,
      () => {},
      (p) => p,
      (id) =>
        id === '/lib/index.qwik.mjs'
          ? ({
              dynamicallyImportedIds: [
                '/lib/index.qwik.mjs_used.js',
                '/lib/index.qwik.mjs_unused.js',
              ],
              meta: {},
            } as any)
          : ({ dynamicallyImportedIds: [], meta: { segment: true } } as any)
    );
    expect(manifest.bundles['lib.js'].dynamicImports).toEqual(['unused.js']);
    expect(manifest.bundles['lib.js'].qrlImports).toEqual(['unused.js']);
  });

  test('leaves core handler symbols unmapped when no qwik-core chunk exists', () => {
    const manifest = generate({ 'q-app.js': chunk('app', 'q-app.js') });
    expect(manifest.core).toBeUndefined();
    expect(manifest.mapping['_run']).toBeUndefined();
  });
});

describe('computeTotals', () => {
  const totalsOf = (bundles: Record<string, Partial<QwikBundle>>) => {
    computeTotals(bundles as Record<string, QwikBundle>);
    return Object.fromEntries(Object.entries(bundles).map(([name, b]) => [name, b.total]));
  };

  test('counts a bundle reached through several imports once', () => {
    expect(
      totalsOf({
        'page.js': { size: 1, imports: ['left.js', 'right.js'] },
        'left.js': { size: 10, imports: ['shared.js'] },
        'right.js': { size: 100, imports: ['shared.js'] },
        'shared.js': { size: 1000 },
      })
    ).toEqual({ 'page.js': 1111, 'left.js': 1010, 'right.js': 1100, 'shared.js': 1000 });
  });

  test('counts an import cycle reached through several imports once', () => {
    expect(
      totalsOf({
        'page.js': { size: 1, imports: ['left.js', 'right.js'] },
        'left.js': { size: 10, imports: ['cycle-a.js'] },
        'right.js': { size: 100, imports: ['cycle-b.js'] },
        'cycle-a.js': { size: 1000, imports: ['cycle-b.js'] },
        'cycle-b.js': { size: 10000, imports: ['cycle-a.js'] },
      })
    ).toEqual({
      'page.js': 11111,
      'left.js': 11010,
      'right.js': 11100,
      'cycle-a.js': 11000,
      'cycle-b.js': 11000,
    });
  });
});
