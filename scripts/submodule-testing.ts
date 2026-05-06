import { getBanner, importPath, target, externalImportNoEffects } from './util.ts';
import { build, type BuildOptions } from 'esbuild';
import { type BuildConfig } from './util.ts';
import { join } from 'node:path';
import { writeSubmodulePackageJson } from './package-json.ts';

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

  await build({
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

  await generateTestingPackageJson(config);

  console.log('🦁', submodule);
}

async function generateTestingPackageJson(config: BuildConfig) {
  const testingDistDir = join(config.distQwikPkgDir, 'testing');
  await writeSubmodulePackageJson(testingDistDir, '@qwik.dev/core/testing', config.distVersion, {
    sideEffects: true,
  });
}
