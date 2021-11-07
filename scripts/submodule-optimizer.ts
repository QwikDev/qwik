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
      external: [...nodeBuiltIns, join(config.srcDir, 'optimizer/wasm-web/qwik_wasm.js')], // TODO, horrible hack
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

  await Promise.all([buildOptimizer()]);
}
