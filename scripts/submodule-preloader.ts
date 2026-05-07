import { join } from 'node:path';
import { build } from 'vite';
import { fileSize, type BuildConfig } from './util.ts';
import { MANGLE_PROPS_REGEX } from './submodule-core.ts';

/**
 * Builds the preloader script as a stand-alone ES module. Vite handles the minification via Terser
 * — we only need to pass the property-mangling regex so `$...$` internal properties stay in sync
 * with the names mangled by the core/server bundles (see `MANGLE_PROPS_REGEX`).
 */
export async function submodulePreloader(config: BuildConfig): Promise<void> {
  await build({
    build: {
      emptyOutDir: false,
      copyPublicDir: false,
      lib: {
        entry: join(config.srcQwikDir, 'core/preloader'),
        formats: ['es'],
        fileName: () => 'preloader.mjs',
      },
      rollupOptions: {
        external: ['@qwik.dev/core/build'],
      },
      minify: 'terser',
      terserOptions: {
        compress: {
          defaults: false,
          module: true,
          hoist_props: true,
          unused: true,
          booleans_as_integers: true,
        },
        mangle: {
          toplevel: false,
          properties: {
            // use short attribute names for internal properties
            regex: MANGLE_PROPS_REGEX,
          },
        },
      },
      outDir: config.distQwikPkgDir,
    },
  });

  const preloaderSize = await fileSize(join(config.distQwikPkgDir, 'preloader.mjs'));
  console.log(`🐮 preloader:`, preloaderSize);
}
