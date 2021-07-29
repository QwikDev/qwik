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
    define: inlineQwikScripts(config),
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
    platform: 'node',
    target: nodeTarget,
    inject: [injectGlobalThisPoly(config)],
  });

  await Promise.all([esm, cjs]);

  console.log('🦋', submodule);
}
