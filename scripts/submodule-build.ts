import { type BuildConfig, ensureDir, target, copyFile, type PackageJSON } from './util';
import { join } from 'node:path';
import { type BuildOptions, build } from 'esbuild';
import { writePackageJson } from './package-json';

export async function submoduleBuild(config: BuildConfig) {
  const submodule = 'build';
  const buildSrcDtsDir = join(config.dtsDir, 'packages', 'qwik', 'src', submodule);
  const buildDestDir = join(config.distQwikPkgDir, submodule);

  ensureDir(buildDestDir);

  bundleIndex(config, 'index');
  bundleIndex(config, 'index.dev');
  bundleIndex(config, 'index.prod');

  console.log('🐨', submodule);

  await copyFile(join(buildSrcDtsDir, 'index.d.ts'), join(buildDestDir, 'index.d.ts'));

  const loaderPkg: PackageJSON = {
    name: `@builder.io/qwik/build`,
    version: config.distVersion,
    main: `index.mjs`,
    types: `index.d.ts`,
    private: true,
    type: 'module',
  };
  await writePackageJson(buildDestDir, loaderPkg);
}

export async function bundleIndex(config: BuildConfig, entryName: string) {
  const submodule = 'build';
  const buildDestDir = join(config.distQwikPkgDir, submodule);

  ensureDir(buildDestDir);

  const opts: BuildOptions = {
    entryPoints: [join(config.srcQwikDir, 'build', `${entryName}.ts`)],
    entryNames: entryName,
    outdir: buildDestDir,
    bundle: true,
    sourcemap: true,
    target,
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
  });

  const cjs = build({
    ...opts,
    format: 'cjs',

    banner: {
      js: `globalThis.qwikBuild = (function (module) {`,
    },
    footer: {
      js: `return module.exports; })(typeof module === 'object' && module.exports ? module : { exports: {} });`,
    },
    outExtension: { '.js': '.cjs' },
  });

  await Promise.all([esm, cjs]);
}
