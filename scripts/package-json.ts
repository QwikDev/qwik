import type { BuildConfig, PackageJSON } from './util';
import { readFile, writeFile } from './util';
import { join } from 'path';

/**
 * The published build does not use the package.json found in the root directory.
 * This function generates the package.json file for package to be published.
 * Note that some of the properties can be pulled from the root package.json.
 */
export async function generatePackageJson(config: BuildConfig) {
  const rootPkg = await readPackageJson(config.rootDir);

  const distPkg: PackageJSON = {
    name: rootPkg.name,
    version: config.distVersion,
    description: rootPkg.description,
    license: rootPkg.license,
    main: './core.cjs',
    module: './core.mjs',
    types: './core.d.ts',
    type: 'module',
    exports: {
      '.': {
        import: './core.mjs',
        require: './core.cjs',
      },
      './core': {
        import: './core.mjs',
        require: './core.cjs',
      },
      './core.cjs': './core.cjs',
      './core.mjs': './core.mjs',
      './jsx-runtime': {
        import: './jsx-runtime.mjs',
        require: './jsx-runtime.cjs',
      },
      './jsx-dev-runtime': {
        import: './jsx-runtime.mjs',
        require: './jsx-runtime.cjs',
      },
      './optimizer': {
        import: './optimizer.mjs',
        require: './optimizer.cjs',
      },
      './server/index.cjs': './server/index.cjs',
      './server': {
        import: './server/index.mjs',
        require: './server/index.cjs',
      },
      './testing': {
        import: './testing/index.mjs',
        require: './testing/index.cjs',
      },
      './qwikloader.js': './qwikloader.js',
      './package.json': './package.json',
    },
    files: Array.from(new Set(rootPkg.files)).sort((a, b) => {
      if (a.toLocaleLowerCase() < b.toLocaleLowerCase()) return -1;
      if (a.toLocaleLowerCase() > b.toLocaleLowerCase()) return 1;
      return 0;
    }),
    contributors: rootPkg.contributors,
    homepage: rootPkg.homepage,
    repository: rootPkg.repository,
    bugs: rootPkg.bugs,
    keywords: rootPkg.keywords,
    engines: rootPkg.engines,
  };

  await writePackageJson(config.distPkgDir, distPkg);

  console.log(`🐷 generated package.json`);
}

export async function readPackageJson(pkgJsonDir: string) {
  const pkgJsonPath = join(pkgJsonDir, 'package.json');
  const pkgJson: PackageJSON = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
  return pkgJson;
}

export async function writePackageJson(pkgJsonDir: string, pkgJson: PackageJSON) {
  const pkgJsonPath = join(pkgJsonDir, 'package.json');
  const pkgJsonStr = JSON.stringify(pkgJson, null, 2) + '\n';
  await writeFile(pkgJsonPath, pkgJsonStr);
}
