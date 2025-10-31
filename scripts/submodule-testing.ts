import { getBanner, importPath, target, externalImportNoEffects } from './util';
import { build, type BuildOptions } from 'esbuild';
import { type BuildConfig, type PackageJSON } from './util';
import { join } from 'node:path';
import { writePackageJson } from './package-json';

/** Builds @qwik.dev/core/testing */
export async function submoduleTesting(config: BuildConfig) {
  const submodule = 'testing';

  const opts: BuildOptions = {
    entryPoints: [join(config.srcQwikDir, submodule, 'index.ts')],
    outdir: join(config.distQwikPkgDir, submodule),
    sourcemap: config.dev,
    bundle: true,
    target,
    external: [
      'prettier',
      'vitest',
      '@qwik.dev/core',
      '@qwik.dev/core/build',
      '@qwik.dev/core/preloader',
      '@qwik-client-manifest',
    ],
    platform: 'node',
  };

  const esm = build({
    ...opts,
    format: 'esm',
    banner: { js: getBanner('@qwik.dev/core/testing', config.distVersion) },
    outExtension: { '.js': '.mjs' },
    plugins: [
      importPath(/^@qwik\.dev\/core$/, '../core.mjs'),
      importPath(/^@qwik\.dev\/core\/optimizer$/, '../optimizer.mjs'),
      importPath(/^@qwik\.dev\/core\/server$/, '../server.mjs'),
      externalImportNoEffects(/^(@qwik\.dev\/core\/build|prettier|vitest)$/),
    ],
    define: {
      'globalThis.MODULE_EXT': `"mjs"`,
      'globalThis.RUNNER': `false`,
    },
    target: 'es2020' /* needed for import.meta */,
  });

  await Promise.all([esm]);

  await generateTestingPackageJson(config);

  console.log('🦁', submodule);
}

async function generateTestingPackageJson(config: BuildConfig) {
  const pkg: PackageJSON = {
    name: '@qwik.dev/core/testing',
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
