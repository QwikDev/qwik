import { build, BuildOptions } from 'esbuild';
import { join } from 'path';
import {
  BuildConfig,
  banner,
  importPath,
  target,
  watcher,
  nodeBuiltIns,
  injectDirname,
} from './util';

export async function submoduleTesting(config: BuildConfig) {
  const submodule = 'testing';

  const opts: BuildOptions = {
    entryPoints: {
      index: join(config.srcDir, submodule, 'index.ts'),
      'jest-preprocessor': join(config.srcDir, submodule, 'jest', 'preprocessor.ts'),
      'jest-preset': join(config.srcDir, submodule, 'jest', 'preset.ts'),
      'jest-setuptestframework': join(config.srcDir, submodule, 'jest', 'setuptestframework.ts'),
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
      'globalThis._MODULE_EXT_': `'mjs'`,
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
      'globalThis._MODULE_EXT_': `'cjs'`,
    },
  });

  await Promise.all([esm, cjs]);

  console.log('🦄', submodule);
}
