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
    define: { 'globalThis.qTest': 'false' }, // In vitest environments, `qTest` is `true` which allows test-only code to run, but in production builds it should be `false` to allow dead code elimination.
  });

  const preloaderSize = await fileSize(join(config.distQwikPkgDir, 'preloader.mjs'));
  console.log(`🐮 preloader:`, preloaderSize);
}
