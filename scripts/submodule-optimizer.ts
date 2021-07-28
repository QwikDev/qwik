import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import {
  BuildConfig,
  banner,
  nodeBuiltIns,
  nodeTarget,
  target,
  watcher,
  injectGlobalThisPoly,
} from './util';
import { readFileSync } from 'fs';
import { watch } from 'rollup';

/**
 * Builds @builder.io/optimizer
 */
export async function submoduleOptimizer(config: BuildConfig) {
  const submodule = 'optimizer';

  async function buildSubmodule() {
    const opts: BuildOptions = {
      entryPoints: [join(config.srcDir, submodule, 'index.ts')],
      entryNames: submodule,
      outdir: config.pkgDir,
      bundle: true,
      sourcemap: 'external',
      target,
      banner,
      external: [...nodeBuiltIns, 'esbuild'],
      incremental: config.watch,
      define: {
        'global.QWIK_LOADER_DEFAULT_MINIFIED': JSON.stringify(
          readFileSync(join(config.pkgDir, 'qwikloader.js'), 'utf-8').trim()
        ),
        'global.QWIK_LOADER_DEFAULT_DEBUG': JSON.stringify(
          readFileSync(join(config.pkgDir, 'qwikloader.debug.js'), 'utf-8').trim()
        ),
        'global.QWIK_LOADER_OPTIMIZE_MINIFIED': JSON.stringify(
          readFileSync(join(config.pkgDir, 'qwikloader.optimize.js'), 'utf-8').trim()
        ),
        'global.QWIK_LOADER_OPTIMIZE_DEBUG': JSON.stringify(
          readFileSync(join(config.pkgDir, 'qwikloader.optimize.debug.js'), 'utf-8').trim()
        ),
        'global.PREFETCH_DEFAULT_MINIFIED': JSON.stringify(
          readFileSync(join(config.pkgDir, 'prefetch.js'), 'utf-8').trim()
        ),
        'global.PREFETCH_DEFAULT_DEBUG': JSON.stringify(
          readFileSync(join(config.pkgDir, 'prefetch.debug.js'), 'utf-8').trim()
        ),
      },
    };

    const esm = await build({
      ...opts,
      format: 'esm',
      outExtension: { '.js': '.mjs' },
      watch: watcher(config, submodule),
    });

    const cjs = await build({
      ...opts,
      format: 'cjs',
      outExtension: { '.js': '.cjs' },
      watch: watcher(config),
      platform: 'node',
      target: nodeTarget,
      inject: [injectGlobalThisPoly(config)],
    });

    console.log('🦋', submodule);

    if (config.watch) {
      const watcher = watch({ input: join(config.pkgDir, 'prefetch.debug.js') });
      watcher.on('change', (id) => {
        esm.stop!();
        cjs.stop!();
        watcher.close();
        setTimeout(buildSubmodule);
      });
    }
  }

  await buildSubmodule();
}
