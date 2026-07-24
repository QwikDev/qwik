import { transform } from 'esbuild';
import { join } from 'node:path';
import { build } from 'vite';
import { ESBUILD_BASE, fileSize, readFile, writeFile, type BuildConfig } from './util.ts';
import { MANGLE_PROPS_REGEX, type MangleCache } from './submodule-core.ts';

/**
 * Builds the preloader script as a stand-alone ES module. Vite bundles it unminified, then esbuild
 * minifies and mangles the `$...$` internal properties using the shared `mangleCache` from the core
 * build so the names stay in sync with the core/server bundles (see `MANGLE_PROPS_REGEX`).
 */
export async function submodulePreloader(
  config: BuildConfig,
  mangleCache?: MangleCache
): Promise<void> {
  const preloaderPath = join(config.distQwikPkgDir, 'preloader.mjs');

  await build({
    build: {
      emptyOutDir: false,
      copyPublicDir: false,
      lib: {
        entry: join(config.srcQwikDir, 'core/preloader'),
        formats: ['es'],
        fileName: () => 'preloader.mjs',
      },
      rolldownOptions: {
        external: ['@qwik.dev/core/build'],
      },
      minify: false,
      outDir: config.distQwikPkgDir,
    },
    // In vitest environments `qTest` is `true`; force it `false` here so test-only code is stripped.
    define: { 'globalThis.qTest': 'false' },
  });

  const noMangle = config.mangle === false;
  const code = await readFile(preloaderPath, 'utf-8');
  const result = await transform(code, {
    ...ESBUILD_BASE,
    minifySyntax: true,
    minifyIdentifiers: true,
    legalComments: 'none',
    ...(noMangle
      ? {}
      : {
          mangleProps: new RegExp(MANGLE_PROPS_REGEX),
          mangleQuoted: true,
          mangleCache: mangleCache ?? {},
        }),
  });
  await writeFile(preloaderPath, result.code);

  const preloaderSize = await fileSize(preloaderPath);
  console.log(`🐮 preloader:`, preloaderSize);
}
