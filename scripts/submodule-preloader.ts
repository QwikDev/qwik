import { join } from 'node:path';
import { build } from 'vite';
import { MANGLE_PROPS_REGEX } from './submodule-core.ts';
import { fileSize, type BuildConfig } from './util.ts';

/** Builds the stand-alone preloader module, minified by the bundler. */
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
      rolldownOptions: {
        external: ['@qwik.dev/core/build'],
        treeshake: { moduleSideEffects: false },
        output: { comments: false },
        experimental: { attachDebugInfo: 'none' },
      },
      minify: 'terser',
      // Preloader state is private to this independently bundled module.
      terserOptions: {
        mangle:
          config.mangle === false
            ? false
            : { properties: { regex: new RegExp(MANGLE_PROPS_REGEX) } },
      },
      outDir: config.distQwikPkgDir,
    },
    define: {
      // In vitest, `qTest` is `true` to allow test-only code; production builds eliminate it.
      'globalThis.qTest': 'false',
      // The preloader embeds the singleton registry, which is keyed by version on the client.
      'globalThis.QWIK_VERSION': JSON.stringify(config.distVersion),
    },
  });

  const preloaderSize = await fileSize(join(config.distQwikPkgDir, 'preloader.mjs'));
  console.log(`🐮 preloader:`, preloaderSize);
}
