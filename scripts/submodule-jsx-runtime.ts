import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import { BuildConfig, banner, importPath, target, watcher } from './util';

export async function submoduleJsxRuntime(config: BuildConfig) {
  const submodule = 'jsx-runtime';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, 'jsx_runtime.ts')],
    entryNames: submodule,
    outdir: config.pkgDir,
    bundle: true,
    target,
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    plugins: [importPath(/^@builder\.io\/qwik$/, './core.mjs')],
    watch: watcher(config, submodule),
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    plugins: [importPath(/^@builder\.io\/qwik$/, './core.cjs')],
    watch: watcher(config),
  });

  await Promise.all([esm, cjs]);

  console.log('👾', submodule);
}
