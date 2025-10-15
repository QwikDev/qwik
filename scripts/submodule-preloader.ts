import { join } from 'node:path';
import { build } from 'vite';
import { fileSize, type BuildConfig } from './util';
import { minify } from 'terser';
import type { Plugin } from 'vite';

/**
 * Custom plugin to apply terser during the bundle generation. Vite doesn't minify library ES
 * modules.
 */
function customTerserPlugin(): Plugin {
  return {
    name: 'custom-terser',
    async renderChunk(code, chunk) {
      // Only process JavaScript chunks
      if (!chunk.fileName.endsWith('.mjs') && !chunk.fileName.endsWith('.js')) {
        return null;
      }

      // Keep the result readable for debugging
      const result = await minify(code, {
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
            regex: '^\\$.+\\$$|^[A-Z][a-zA-Z]+$',
          },
        },
        format: {
          comments: true,
        },
      });

      return result.code || null;
    },
  };
}

/**
 * Builds the qwikloader javascript files using Vite. These files can be used by other tooling, and
 * are provided in the package so CDNs could point to them. The @builder.io/optimizer submodule also
 * provides a utility function.
 */
export async function submodulePreloader(config: BuildConfig) {
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
      minify: false, // This is the default, just to be explicit
      outDir: config.distQwikPkgDir,
    },
    plugins: [customTerserPlugin()],
  });

  const preloaderSize = await fileSize(join(config.distQwikPkgDir, 'preloader.mjs'));
  console.log(`🐮 preloader:`, preloaderSize);
}
