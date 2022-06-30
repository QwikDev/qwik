import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import { BuildConfig, importPath, target, watcher } from './util';

/**
 * Builds @builder.io/qwik/jsx-runtime
 *
 * This build mainly is re-exports the jsx runtime functions
 * provided by the core. Internally, the core's JSX renderer
 * is using the latest jsx transform, but Qwik provides both
 * the legacy `h()` jsx factory, and the `jsx()` runtime.
 *
 * - https://reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html
 * - https://www.typescriptlang.org/tsconfig#jsxImportSource
 */
export async function submoduleJsxRuntime(config: BuildConfig) {
  const submodule = 'jsx-runtime';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, 'jsx-runtime', 'index.ts')],
    entryNames: 'jsx-runtime',
    outdir: config.distPkgDir,
    bundle: true,
    sourcemap: true,
    target,
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    plugins: [importPath(/^@builder\.io\/qwik$/, '@builder.io/qwik')],
    watch: watcher(config, submodule),
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    plugins: [importPath(/^@builder\.io\/qwik$/, '@builder.io/qwik')],
    watch: watcher(config),
  });

  await Promise.all([esm, cjs]);

  console.log('🐮', submodule);
}
