import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import { BuildConfig, banner, nodeBuiltIns, target, watcher } from './util';
import { readFileSync } from 'fs';

/**
 * Builds @builder.io/optimizer
 */
export async function submoduleOptimizer(config: BuildConfig) {
  const submodule = 'optimizer';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, submodule, 'index.ts')],
    entryNames: submodule,
    outdir: config.pkgDir,
    bundle: true,
    sourcemap: 'external',
    target,
    banner,
    external: [...nodeBuiltIns, 'esbuild'],
    define: {
      'globalThis.QWIK_LOADER_DEFAULT_MINIFIED': JSON.stringify(
        readFileSync(join(config.pkgDir, 'qwikloader.js'), 'utf-8').trim()
      ),
      'globalThis.QWIK_LOADER_DEFAULT_DEBUG': JSON.stringify(
        readFileSync(join(config.pkgDir, 'qwikloader.debug.js'), 'utf-8').trim()
      ),
      'globalThis.QWIK_LOADER_OPTIMIZE_MINIFIED': JSON.stringify(
        readFileSync(join(config.pkgDir, 'qwikloader.optimize.js'), 'utf-8').trim()
      ),
      'globalThis.QWIK_LOADER_OPTIMIZE_DEBUG': JSON.stringify(
        readFileSync(join(config.pkgDir, 'qwikloader.optimize.debug.js'), 'utf-8').trim()
      ),
    },
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    watch: watcher(config, submodule),
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    watch: watcher(config),
  });

  await Promise.all([esm, cjs]);

  console.log('🦋', submodule);
}
