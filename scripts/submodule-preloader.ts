import { join } from 'node:path';
import { build } from 'vite';
import { fileSize, type BuildConfig } from './util';

/**
 * Builds the qwikloader javascript files using Vite. These files can be used by other tooling, and
 * are provided in the package so CDNs could point to them. The @builder.io/optimizer submodule also
 * provides a utility function.
 */
export async function submodulePreloader(config: BuildConfig) {
  await build({
    build: {
      lib: {
        entry: join(config.srcQwikDir, 'core/preloader'),
        formats: ['es'],
        fileName: () => 'preloader.mjs',
      },
      rollupOptions: {
        external: ['@builder.io/qwik/build'],
      },
      minify: 'terser',
      terserOptions: {
        compress: {
          dead_code: true,
          unused: true,
          conditionals: true,
        },
        mangle: {
          toplevel: false,
          module: false,
          keep_fnames: true,
          properties: {
            regex: '^\\$.+\\$$',
          },
        },
      },
      outDir: config.distQwikPkgDir,
    },
  });

  const preloaderSize = await fileSize(join(config.distQwikPkgDir, 'preloader.mjs'));
  console.log(`🐮 preloader:`, preloaderSize);
}
