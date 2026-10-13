import { join } from 'node:path';
import { build } from 'vite';
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
        output: { comments: false },
        experimental: { attachDebugInfo: 'none' },
      },
      minify: true,
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
