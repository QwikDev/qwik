import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import { BuildConfig, banner, importPath, target, watcher, nodeBuiltIns } from './util';

/**
 * Builds @builder.io/server
 *
 * This is submodule for helping to generate server-side rendered pages,
 * along with providing utilities for prerendering and unit testing.
 */
export async function submoduleServer(config: BuildConfig) {
  const submodule = 'server';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, submodule, 'index.ts')],
    outdir: join(config.pkgDir, submodule),
    sourcemap: true,
    bundle: true,
    target,
    banner,
    external: [...nodeBuiltIns, 'domino', 'source-map-support'],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.mjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.mjs'),
    ],
    watch: watcher(config, submodule),
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.cjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.cjs'),
    ],
    watch: watcher(config),
  });

  await Promise.all([esm, cjs]);

  console.log('🐠', submodule);
}
