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

  await writePackageJson(config.distPkgDir, distPkg);

  console.log('🐷', 'generated package.json');
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

/**
 * These are the exact outputs that should end up in the published package.
 * This is used to create the package.json "files" property.
 */
const PACKAGE_FILES = [
  // core
  'core.cjs',
  'core.cjs.map',
  'core.min.mjs',
  'core.mjs',
  'core.mjs.map',
  'core.d.ts',

  // jsx-runtime
  'jsx-runtime.cjs',
  'jsx-runtime.cjs.map',
  'jsx-runtime.mjs',
  'jsx-runtime.mjs.map',
  'jsx-runtime.d.ts',

  // optimizer
  'optimizer.cjs',
  'optimizer.mjs',
  'optimizer.d.ts',

  // prefetch
  'prefetch.js',
  'prefetch.debug.js',

  // qwikloader
  'qwikloader.js',
  'qwikloader.debug.js',
  'qwikloader.optimize.js',
  'qwikloader.optimize.debug.js',

  // server
  'server/index.cjs',
  'server/index.mjs',
  'server/index.d.ts',

  // testing
  'testing/index.cjs',
  'testing/index.mjs',
  'testing/index.d.ts',
  'testing/jest-preset.cjs',
  'testing/jest-preset.mjs',

  // package files
  'README.md',
  'LICENSE',
  'package.json',

  // platform bindings
  'qwik.darwin-x64.node',
  // 'qwik.darwin-arm64.node',
  'qwik.win32-x64-msvc.node',

  // wasm
  'qwik.nodejs.js',
  'qwik.nodejs.wasm',
  'qwik.web.js',
  'qwik.web.wasm',
];
