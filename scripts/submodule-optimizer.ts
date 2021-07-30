import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import {
  BuildConfig,
  banner,
  injectGlobalThisPoly,
  inlineQwikScripts,
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
      define: inlineQwikScripts(config),
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
