import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import {
  BuildConfig,
  banner,
  injectGlobalThisPoly,
  nodeBuiltIns,
  nodeTarget,
  target,
  watcher,
} from './util';
import { watch } from 'rollup';

/**
 * Builds @builder.io/optimizer
 */
export async function submoduleOptimizer(config: BuildConfig) {
  const submodule = 'optimizer';
  const optimizerDistDir = join(config.distPkgDir, submodule);

  async function buildOptimizer() {
    const opts: BuildOptions = {
      entryPoints: [join(config.srcDir, submodule, 'src', 'index.ts')],
      entryNames: 'index',
      outdir: optimizerDistDir,
      bundle: true,
      sourcemap: config.dev,
      target,
      banner,
      external: [...nodeBuiltIns],
      incremental: config.watch,
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

    console.log('🐹', submodule);

    if (config.watch) {
      const watcher = watch({ input: join(config.distPkgDir, 'prefetch.debug.js') });
      watcher.on('change', (id) => {
        esm.stop!();
        cjs.stop!();
        watcher.close();
        setTimeout(buildOptimizer);
      });
    }
  }

  async function buildOptimizerRollupPlgin() {
    const opts: BuildOptions = {
      entryPoints: [join(config.srcDir, submodule, 'src', 'rollup', 'index.ts')],
      entryNames: 'rollup',
      outdir: optimizerDistDir,
      bundle: true,
      sourcemap: false,
      target,
      banner,
      external: [...nodeBuiltIns],
      incremental: config.watch,
    };

    const esm = await build({
      ...opts,
      format: 'esm',
      outExtension: { '.js': '.mjs' },
      watch: watcher(config, 'rollup-plugin'),
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

    console.log('🐼', 'rollup-plugin');
  }

  await Promise.all([buildOptimizer(), buildOptimizerRollupPlgin()]);
}
