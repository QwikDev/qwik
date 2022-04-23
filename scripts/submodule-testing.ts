import { getBanner, importPath, nodeBuiltIns, nodeTarget, target, watcher } from './util';
import { build, BuildOptions } from 'esbuild';
import { BuildConfig, injectGlobalThisPoly, PackageJSON } from './util';
import { join } from 'path';
import { writePackageJson } from './package-json';

/**
 * Builds @builder.io/testing
 */
export async function submoduleTesting(config: BuildConfig) {
  const submodule = 'testing';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, submodule, 'index.ts')],
    outdir: join(config.distPkgDir, submodule),
    sourcemap: config.dev,
    bundle: true,
    target,
    external: [...nodeBuiltIns],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    banner: { js: getBanner('@builder.io/qwik/testing') },
    outExtension: { '.js': '.mjs' },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.mjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.mjs'),
      importPath(/^@builder\.io\/qwik\/server$/, '../server.mjs'),
    ],
    watch: watcher(config, submodule),
    define: {
      'globalThis.MODULE_EXT': `"mjs"`,
    },
    target: 'es2020' /* needed for import.meta */,
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    banner: { js: getBanner('@builder.io/qwik/testing') + injectGlobalThisPoly() },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.cjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.cjs'),
      importPath(/^@builder\.io\/qwik\/server$/, '../server.cjs'),
    ],
    watch: watcher(config),
    define: {
      'globalThis.MODULE_EXT': `"cjs"`,
    },
    platform: 'node',
    target: nodeTarget,
  });

  await Promise.all([esm, cjs]);

  await generateTestingPackageJson(config);

  console.log('🦁', submodule);
}

async function generateTestingPackageJson(config: BuildConfig) {
  const pkg: PackageJSON = {
    name: '@builder.io/qwik/testing',
    version: config.distVersion,
    main: 'index.cjs',
    module: 'index.mjs',
    types: 'index.d.ts',
    private: true,
  };
  const testingDistDir = join(config.distPkgDir, 'testing');
  await writePackageJson(testingDistDir, pkg);
}
