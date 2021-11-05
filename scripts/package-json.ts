import type { BuildConfig, PackageJSON } from './util';
import { readFile, writeFile } from './util';
import { join } from 'path';

/**
 * The published build does not use the package.json found in the root directory.
 * This function generates the package.json file for package to be published.
 * Note that some of the properties can be pulled from the root package.json.
 */
export async function generatePackageJson(config: BuildConfig) {
  const pkgJsonRoot = join(config.rootDir, 'package.json');
  const pkgJsonDist = join(config.distPkgDir, 'package.json');

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
        import: './jsx-runtime/index.mjs',
        require: './jsx-runtime/index.cjs',
      },
      './optimizer': {
        import: './optimizer/index.mjs',
        require: './optimizer/index.cjs',
      },
      './optimizer/rollup': {
        import: './optimizer/rollup.mjs',
        require: './optimizer/rollup.cjs',
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

  console.log('🐷', 'generate package.json');
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
  'jsx-runtime/index.cjs',
  'jsx-runtime/index.cjs.map',
  'jsx-runtime/index.mjs',
  'jsx-runtime/index.mjs.map',
  'jsx-runtime/index.d.ts',

  // optimizer
  'optimizer/index.cjs',
  'optimizer/index.mjs',
  'optimizer/index.d.ts',
  'optimizer/rollup.cjs',
  'optimizer/rollup.mjs',

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
  'testing/jest-preprocessor.cjs',
  'testing/jest-preprocessor.mjs',
  'testing/jest-preset.cjs',
  'testing/jest-preset.mjs',

  // package files
  'README.md',
  'LICENSE',
  'package.json',

  // platform bindings (only found in CI build)
  'qwik.darwin-arm64.node',
  'qwik.darwin-x64.node',
  'qwik.win32-x64-msvc.node',
];
