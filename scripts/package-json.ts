import type { BuildConfig, PackageJSON } from './util';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * The published build does not use the package.json found in the root directory.
 * This function generates the package.json file for package to be published.
 * Note that some of the properties can be pulled from the root package.json.
 */
export async function generatePackageJson(config: BuildConfig) {
  const pkgJsonRoot = join(config.rootDir, 'package.json');
  const pkgJsonDist = join(config.pkgDir, 'package.json');

  const rootPkg: PackageJSON = JSON.parse(await readFile(pkgJsonRoot, 'utf-8'));

  const distPkg: PackageJSON = {
    name: rootPkg.name,
    version: rootPkg.version,
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
      './jsx-runtime': {
        import: './jsx-runtime.mjs',
        require: './jsx-runtime.cjs',
      },
      './optimizer': {
        import: './optimizer.mjs',
        require: './optimizer.cjs',
      },
      './server': {
        import: './server/index.mjs',
        require: './server/index.cjs',
      },
      './testing': {
        import: './testing/index.mjs',
        require: './testing/index.cjs',
      },
      './package.json': './package.json',
    },
    files: Array.from(new Set(PACKAGE_FILES)).sort((a, b) => {
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

  const pkgContent = JSON.stringify(distPkg, null, 2);

  await writeFile(pkgJsonDist, pkgContent);

  console.log('👻', 'generate package.json');
}

/**
 * These are the exact outputs that should end up in the published package.
 * This is used to create the package.json "files" property.
 */
const PACKAGE_FILES = [
  'core.cjs',
  'core.cjs.map',
  'core.min.mjs',
  'core.mjs',
  'core.mjs.map',
  'core.d.ts',
  'jsx-runtime.cjs',
  'jsx-runtime.mjs',
  'jsx-runtime.d.ts',
  'LICENSE',
  'optimizer.cjs',
  'optimizer.cjs.map',
  'optimizer.mjs',
  'optimizer.mjs.map',
  'optimizer.d.ts',
  'package.json',
  'qwikloader.js',
  'qwikloader.debug.js',
  'qwikloader.optimize.js',
  'qwikloader.optimize.debug.js',
  'README.md',
  'server/index.cjs',
  'server/index.cjs.map',
  'server/index.mjs',
  'server/index.mjs.map',
  'server/index.d.ts',
  'testing/index.cjs',
  'testing/index.cjs.map',
  'testing/index.mjs',
  'testing/index.mjs.map',
  'testing/index.d.ts',
  'testing/jest-preprocessor.cjs',
  'testing/jest-preprocessor.cjs.map',
  'testing/jest-preprocessor.mjs',
  'testing/jest-preprocessor.mjs.map',
  'testing/jest-preset.cjs',
  'testing/jest-preset.cjs.map',
  'testing/jest-preset.mjs',
  'testing/jest-preset.mjs.map',
  'testing/jest-setuptestframework.cjs',
  'testing/jest-setuptestframework.cjs.map',
  'testing/jest-setuptestframework.mjs',
  'testing/jest-setuptestframework.mjs.map',
];
