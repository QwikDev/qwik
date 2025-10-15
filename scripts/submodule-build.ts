import { build } from 'vite';
import { join } from 'node:path';
import { writePackageJson } from './package-json';
import { type BuildConfig, copyFile, ensureDir, type PackageJSON, target } from './util';

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
    name: `@qwik.dev/core/build`,
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

  await build({
    clearScreen: false,
    build: {
      emptyOutDir: false,
      lib: {
        entry: join(config.srcQwikDir, 'build', `${entryName}.ts`),
        name: 'qwikBuild',
      },
      outDir: buildDestDir,
      sourcemap: true,
      target,
      rollupOptions: {
        output: [
          {
            format: 'es',
            entryFileNames: `${entryName}.mjs`,
          },
        ],
      },
    },
  });
}
