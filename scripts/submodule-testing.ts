import { BuildConfig, injectGlobalThisPoly } from './util';
import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import {
  banner,
  importPath,
  injectDirname,
  nodeBuiltIns,
  nodeTarget,
  target,
  watcher,
} from './util';

/**
 * Builds @builder.io/testing
 */
export async function submoduleTesting(config: BuildConfig) {
  const submodule = 'testing';

  const opts: BuildOptions = {
    entryPoints: {
      index: join(config.srcDir, submodule, 'index.ts'),
      'jest-preprocessor': join(config.srcDir, submodule, 'jest', 'preprocessor.ts'),
      'jest-preset': join(config.srcDir, submodule, 'jest', 'preset.ts'),
    },
    outdir: join(config.pkgDir, submodule),
    sourcemap: true,
    bundle: true,
    target,
    banner,
    external: [...nodeBuiltIns],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.mjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.mjs'),
      importPath(/^@builder\.io\/qwik\/server$/, '../server/index.mjs'),
    ],
    watch: watcher(config, submodule),
    define: {
      'globalThis.MODULE_EXT': `"mjs"`,
    },
    inject: [injectDirname(config)],
    target: 'es2020' /* needed for import.meta */,
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.cjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.cjs'),
      importPath(/^@builder\.io\/qwik\/server$/, '../server/index.cjs'),
    ],
    watch: watcher(config),
    define: {
      'globalThis.MODULE_EXT': `"cjs"`,
    },
    platform: 'node',
    target: nodeTarget,
    inject: [injectGlobalThisPoly(config)],
  });

  await Promise.all([esm, cjs]);

  console.log('🦄', submodule);
}
