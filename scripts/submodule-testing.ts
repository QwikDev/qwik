import { getBanner, importPath, nodeTarget, target, externalImportNoEffects } from './util';
import { build, type BuildOptions } from 'esbuild';
import { type BuildConfig, type PackageJSON } from './util';
import { join } from 'node:path';
import { writePackageJson } from './package-json';

/** Builds @builder.io/testing */
export async function submoduleTesting(config: BuildConfig) {
  const submodule = 'testing';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcQwikDir, submodule, 'index.ts')],
    outdir: join(config.distQwikPkgDir, submodule),
    sourcemap: config.dev,
    bundle: true,
    target,
    platform: 'node',
    // uncomment this if you want to find what imports qwik-external
    external: ['@builder.io/qwik-external'],
  };

  const esm = build({
    ...opts,
    format: 'esm',
    banner: { js: getBanner('@builder.io/qwik/testing', config.distVersion) },
    outExtension: { '.js': '.mjs' },
    plugins: [
      // uncomment this if you want to find what imports qwik-external
      {
        name: 'spy-resolve',
        setup(build) {
          build.onResolve({ filter: /./ }, (args) => {
            console.log('spy-resolve', args);
            return undefined;
          });
        },
      },
      importPath(/^@builder\.io\/qwik$/, '../core.qwik.mjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.mjs'),
      importPath(/^@builder\.io\/qwik\/server$/, '../server.mjs'),
      externalImportNoEffects(/^(@builder\.io\/qwik\/build|prettier|vitest)$/),
    ],
    define: {
      'globalThis.MODULE_EXT': `"mjs"`,
      'globalThis.RUNNER': `false`,
    },
    target: 'es2020' /* needed for import.meta */,
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    banner: {
      js: getBanner('@builder.io/qwik/testing', config.distVersion),
    },
    plugins: [
      importPath(/^@builder\.io\/qwik$/, '../core.qwik.cjs'),
      importPath(/^@builder\.io\/qwik\/optimizer$/, '../optimizer.cjs'),
      importPath(/^@builder\.io\/qwik\/server$/, '../server.cjs'),
      externalImportNoEffects(/^(@builder\.io\/qwik\/build|prettier|vitest)$/),
    ],
    define: {
      'globalThis.MODULE_EXT': `"cjs"`,
      'globalThis.RUNNER': `false`,
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
    main: 'index.mjs',
    types: 'index.d.ts',
    private: true,
    type: 'module',
    sideEffects: true,
  };
  const testingDistDir = join(config.distQwikPkgDir, 'testing');
  await writePackageJson(testingDistDir, pkg);
}
