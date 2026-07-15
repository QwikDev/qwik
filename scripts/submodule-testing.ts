import { build, type BuildOptions } from 'esbuild';
import { join } from 'node:path';
import { writeSubmodulePackageJson } from './package-json.ts';
import {
  externalImportNoEffects,
  getBanner,
  importPath,
  target,
  type BuildConfig,
} from './util.ts';

/** Builds @qwik.dev/core/testing. */
export async function submoduleTesting(config: BuildConfig) {
  const opts: BuildOptions = {
    entryPoints: [join(config.srcQwikDir, 'testing', 'index.ts')],
    outdir: join(config.distQwikPkgDir, 'testing'),
    sourcemap: config.dev,
    bundle: true,
    target,
    external: [
      '@qwik.dev/compiler',
      '@qwik.dev/core',
      '@qwik.dev/core/internal',
      '@qwik.dev/core/server',
      'prettier',
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
      importPath(/^@qwik\.dev\/core\/internal$/, '../core.mjs'),
      importPath(/^@qwik\.dev\/core\/server$/, '../server.mjs'),
      externalImportNoEffects(/^(@qwik\.dev\/compiler|prettier)$/),
    ],
    define: {
      'globalThis.MODULE_EXT': '"mjs"',
      'globalThis.RUNNER': 'false',
    },
    target: 'es2020',
  });

  await writeSubmodulePackageJson(
    join(config.distQwikPkgDir, 'testing'),
    '@qwik.dev/core/testing',
    config.distVersion,
    { sideEffects: false }
  );

  console.log('🦁 testing');
}
