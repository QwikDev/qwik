import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { generateManifestFromBundles } from './manifest';

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
    const page = { ...chunk('page', 'page.js'), modules: { '/app/page.tsx': {} } };
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

  test('leaves core handler symbols unmapped when no qwik-core chunk exists', () => {
    const manifest = generate({ 'q-app.js': chunk('app', 'q-app.js') });
    expect(manifest.core).toBeUndefined();
    expect(manifest.mapping['_run']).toBeUndefined();
  });
});
