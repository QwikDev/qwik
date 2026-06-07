import { build, type BuildOptions } from 'esbuild';
import { join } from 'node:path';
import { writeSubmodulePackageJson } from './package-json.ts';
import { getBanner, target, type BuildConfig } from './util.ts';

/** Builds @qwik.dev/core/spark */
export async function submoduleSpark(config: BuildConfig) {
  const submodule = 'spark';
  const distDir = join(config.distQwikPkgDir, submodule);

  const opts: BuildOptions = {
    entryPoints: [join(config.srcQwikDir, submodule, 'index.ts')],
    outdir: distDir,
    sourcemap: config.dev,
    bundle: true,
    target,
    external: ['@qwik.dev/core/build', '@qwik.dev/core/preloader', 'node:async_hooks'],
  };

  await build({
    ...opts,
    format: 'esm',
    banner: { js: getBanner('@qwik.dev/core/spark', config.distVersion) },
    outExtension: { '.js': '.mjs' },
  });

  await writeSubmodulePackageJson(distDir, '@qwik.dev/core/spark', config.distVersion);

  console.log('spark', submodule);
}
