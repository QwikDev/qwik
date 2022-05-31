import { BuildConfig, ensureDir, watcher, target, copyFile, PackageJSON } from './util';
import { join } from 'path';
import { BuildOptions, build } from 'esbuild';
import { writePackageJson } from './package-json';

export async function submoduleBuild(config: BuildConfig) {
  const submodule = 'build';
  const buildSrcDtsDir = join(config.dtsDir, 'packages', 'qwik', 'src', submodule);
  const buildDestDir = join(config.distPkgDir, submodule);

  ensureDir(buildDestDir);

  const opts: BuildOptions = {
    entryPoints: [join(config.srcDir, 'build', 'index.ts')],
    entryNames: 'index',
    outdir: buildDestDir,
    bundle: true,
    sourcemap: true,
    target,
  };

  const esm = build({
    ...opts,
    format: 'esm',
    outExtension: { '.js': '.mjs' },
    watch: watcher(config, submodule),
  });

  const cjs = build({
    ...opts,
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    watch: watcher(config),
  });

  await Promise.all([esm, cjs]);

  console.log('🐨', submodule);

  await copyFile(join(buildSrcDtsDir, 'index.d.ts'), join(buildDestDir, 'index.d.ts'));

  const loaderPkg: PackageJSON = {
    name: `@builder.io/qwik/build`,
    version: config.distVersion,
    main: `index.cjs`,
    module: `index.mjs`,
    types: `index.d.ts`,
    private: true,
  };
  await writePackageJson(buildDestDir, loaderPkg);
}
