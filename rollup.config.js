import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import replace from '@rollup/plugin-replace';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { copyFileSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import pkg from './package.json';

const build = {};

export default async (cliArgs) => {
  build.isDev = !!cliArgs.configDev;
  build.rootDir = __dirname;
  build.distDir = join(build.rootDir, 'dist-dev');
  build.srcDir = join(build.rootDir, 'src');
  build.tsDir = join(build.distDir, 'tsc-out');
  build.pkgDir = join(build.distDir, '@builder.io-qwik');

  // All rollup bundles should share the same typescript plugin instance for performance
  build.tsPlugin = typescript({
    tsconfig: 'tsconfig.dev.json',
    outDir: build.tsDir,
    cacheDir: join(build.tsDir, '.rollup'),
  });

  if (!build.isDev) {
    // empty pkgDir before starting production build
    rmSync(build.pkgDir, { recursive: true, force: true });
  }

  try {
    // ensure the build pkgDir exists
    mkdirSync(build.pkgDir, { recursive: true });
  } catch (e) {}

  return [
    core(),
    jsxRuntime(),
    qwikloader(),
    optimizer(),
    server(),
    testing(),
    integrationServer(),
  ];
};

/**
 * @builder.io/qwik
 */
function core() {
  return {
    input: { core: 'src/core/index.ts' },
    output: [
      {
        dir: build.tsDir,
        format: 'es',
        entryFileNames: `[name].mjs`,
        chunkFileNames: `[name].mjs`,
        sourcemap: true,
        banner,
      },
      {
        dir: build.tsDir,
        format: 'cjs',
        entryFileNames: `[name].cjs`,
        chunkFileNames: `[name].cjs`,
        sourcemap: true,
        banner,
      },
      !build.isDev
        ? {
            // minified core (esm), production build only
            dir: build.tsDir,
            format: 'es',
            entryFileNames: `[name].min.mjs`,
            chunkFileNames: `[name].min.mjs`,
            sourcemap: true,
            plugins: [
              replace({
                // remove development code w/in minified version
                'globalThis.qDev': false,
              }),
              terser({
                output: {
                  comments: false,
                  preamble: banner,
                },
              }),
            ],
          }
        : null,
    ],
    plugins: [
      build.tsPlugin,
      outputPackage(),
      {
        writeBundle(opts) {
          if (opts.entryFileNames == '[name].mjs' && !build.isDev) {
            generatePackageFiles();
          }
        },
      },
    ],
    onwarn,
  };
}

/**
 * @builder.io/qwik/jsx-runtime
 */
function jsxRuntime() {
  return {
    input: { 'jsx-runtime': 'src/jsx_runtime.ts' },
    output: [
      {
        dir: build.tsDir,
        format: 'es',
        entryFileNames: `[name].mjs`,
        chunkFileNames: `[name].mjs`,
        sourcemap: true,
      },
      {
        dir: build.tsDir,
        format: 'cjs',
        entryFileNames: `[name].cjs`,
        chunkFileNames: `[name].cjs`,
        sourcemap: true,
      },
    ],
    plugins: [
      {
        resolveId(id) {
          if (id === '@builder.io/qwik') {
            return { id: './core._MODULE_EXT_', external: true };
          }
        },
      },
      build.tsPlugin,
      outputPackage(),
    ],
    onwarn,
  };
}

/**
 * @builder.io/qwik/qwikloader.js
 */
function qwikloader() {
  return {
    input: 'src/qwikloader.ts',
    output: [
      {
        // QWIK_LOADER_DEFAULT_MINIFIED
        dir: build.tsDir,
        format: 'es',
        entryFileNames: `[name].js`,
        exports: 'none',
        plugins: [
          terser({
            compress: {
              global_defs: {
                'globalThis.buildEvents': false,
              },
              keep_fargs: false,
              unsafe: true,
              passes: 2,
            },
            format: {
              comments: false,
            },
          }),
        ],
      },
      {
        // QWIK_LOADER_EVENTS_MINIFIED
        dir: build.tsDir,
        format: 'es',
        entryFileNames: `[name].events.js`,
        exports: 'none',
        plugins: [
          terser({
            compress: {
              global_defs: {
                'globalThis.buildEvents': true,
              },
              keep_fargs: false,
              unsafe: true,
              passes: 2,
            },
            format: {
              comments: false,
            },
          }),
        ],
      },
      {
        // QWIK_LOADER_DEFAULT_DEBUG
        dir: build.tsDir,
        format: 'es',
        entryFileNames: `[name].debug.js`,
        exports: 'none',
        plugins: [
          terser({
            compress: {
              global_defs: {
                'globalThis.buildEvents': false,
              },
              inline: false,
              join_vars: false,
              loops: false,
              sequences: false,
            },
            format: {
              comments: false,
              beautify: true,
              braces: true,
            },
            mangle: false,
          }),
        ],
      },
      {
        // QWIK_LOADER_EVENTS_DEBUG
        dir: build.tsDir,
        format: 'es',
        entryFileNames: `[name].events.debug.js`,
        exports: 'none',
        plugins: [
          terser({
            compress: {
              global_defs: {
                'globalThis.buildEvents': true,
              },
              inline: false,
              join_vars: false,
              loops: false,
              sequences: false,
            },
            format: {
              comments: false,
              beautify: true,
              braces: true,
            },
            mangle: false,
          }),
        ],
      },
    ],
    plugins: [
      build.tsPlugin,
      {
        generateBundle(opts, bundle) {
          for (const b in bundle) {
            const outFile = bundle[b];
            if (outFile.fileName.endsWith('.js')) {
              outFile.fileName = '../@builder.io-qwik/' + outFile.fileName;
            }
          }
        },
      },
    ],
    onwarn,
  };
}

/**
 * @builder.io/qwik/optimizer
 */
function optimizer() {
  return {
    input: {
      optimizer: 'src/optimizer/index.ts',
    },
    output: [
      {
        dir: build.tsDir,
        format: 'es',
        entryFileNames: `[name].mjs`,
        chunkFileNames: `[name].mjs`,
        sourcemap: true,
        banner,
      },
      {
        dir: build.tsDir,
        format: 'cjs',
        entryFileNames: `[name].cjs`,
        chunkFileNames: `[name].cjs`,
        sourcemap: true,
        banner,
      },
    ],
    external: ['esbuild', 'fs', 'fs/promises', 'module', 'path'],
    plugins: [
      build.tsPlugin,
      outputPackage(),
      replace({
        __TYPESCRIPT__: () => require('typescript').version,
        'globalThis.QWIK_LOADER_DEFAULT_MINIFIED': () => {
          return JSON.stringify(readFileSync(join(build.pkgDir, 'qwikloader.js'), 'utf-8').trim());
        },
        'globalThis.QWIK_LOADER_DEFAULT_DEBUG': () => {
          return JSON.stringify(
            readFileSync(join(build.pkgDir, 'qwikloader.debug.js'), 'utf-8').trim()
          );
        },
        'globalThis.QWIK_LOADER_EVENTS_MINIFIED': () => {
          return JSON.stringify(
            readFileSync(join(build.pkgDir, 'qwikloader.events.js'), 'utf-8').trim()
          );
        },
        'globalThis.QWIK_LOADER_EVENTS_DEBUG': () => {
          return JSON.stringify(
            readFileSync(join(build.pkgDir, 'qwikloader.events.debug.js'), 'utf-8').trim()
          );
        },
        preventAssignment: true,
      }),
    ],
    onwarn,
  };
}

/**
 * @builder.io/qwik/server
 */
function server() {
  return {
    input: 'src/server/index.ts',
    output: [
      {
        dir: build.tsDir,
        format: 'es',
        entryFileNames: `[name].mjs`,
        chunkFileNames: `[name].mjs`,
        sourcemap: true,
        banner,
      },
      {
        dir: build.tsDir,
        format: 'cjs',
        entryFileNames: `[name].cjs`,
        chunkFileNames: `[name].cjs`,
        sourcemap: true,
        banner,
      },
    ],
    // do not attempt to bundle these imports
    external: ['domino', 'fs', 'path', 'source-map-support', 'url'],
    plugins: [
      {
        resolveId(id) {
          if (id === '@builder.io/qwik') {
            return {
              id: '../core._MODULE_EXT_',
              external: true,
            };
          }
          if (id === '@builder.io/qwik/optimizer') {
            return {
              id: '../optimizer._MODULE_EXT_',
              external: true,
            };
          }
        },
      },
      build.tsPlugin,
      outputPackage('server/'),
    ],
    onwarn,
  };
}

/**
 * @builder.io/qwik/testing
 */
function testing() {
  return {
    input: {
      index: 'src/testing/index.ts',
      'jest-preprocessor': 'src/testing/jest/preprocessor.ts',
      'jest-preset': 'src/testing/jest/preset.ts',
      'jest-setuptestframework': 'src/testing/jest/setuptestframework.ts',
    },
    output: [
      {
        dir: build.tsDir,
        format: 'es',
        entryFileNames: `[name].mjs`,
        chunkFileNames: `[name].mjs`,
        sourcemap: true,
        banner,
      },
      {
        dir: build.tsDir,
        format: 'cjs',
        entryFileNames: `[name].cjs`,
        chunkFileNames: `[name].cjs`,
        sourcemap: true,
        banner,
      },
    ],
    // do not attempt to bundle these imports
    external: ['fs', 'path', 'url'],
    plugins: [
      {
        resolveId(id) {
          if (id === '@builder.io/qwik/optimizer') {
            return {
              id: '../optimizer._MODULE_EXT_',
              external: true,
            };
          }
          if (id === '@builder.io/qwik/server') {
            return {
              id: '../server/index._MODULE_EXT_',
              external: true,
            };
          }
          if (id === '@builder.io/qwik/testing') {
            return {
              id: './index._MODULE_EXT_',
              external: true,
            };
          }
          if (id === '@builder.io/qwik') {
            return {
              id: '../core._MODULE_EXT_',
              external: true,
            };
          }
        },
      },
      build.tsPlugin,
      outputPackage('testing/'),
    ],
    onwarn,
  };
}

/**
 * - Relocate build files to desired submodule location.
 * - Ensure import paths to other submodules include file extensions.
 */
function outputPackage(subpackage) {
  return {
    generateBundle(opts, bundle) {
      const ext = opts.format === 'cjs' ? 'cjs' : 'mjs';
      for (const b in bundle) {
        const outFile = bundle[b];
        if (outFile.fileName.endsWith('.mjs') || outFile.fileName.endsWith('.cjs')) {
          outFile.fileName = '../@builder.io-qwik/' + (subpackage || '') + outFile.fileName;
          outFile.code = outFile.code.replace(/_MODULE_EXT_/g, ext);
        }
        if (outFile?.map?.sources) {
          for (let i = 0; i < outFile.map.sources.length; i++) {
            const src = outFile.map.sources[i];
            const lastIndex = src.lastIndexOf('src');
            const updated = '../../' + src.substr(lastIndex);
            outFile.map.sources[i] = updated;
          }
        }
      }
    },
  };
}

/**
 * Development integration server-side build
 */
function integrationServer() {
  return {
    input: 'integration/devserver.ts',
    output: {
      dir: build.tsDir,
      format: 'cjs',
      sourcemap: true,
    },
    external: ['express', 'fs', 'module', 'path', 'source-map-support', 'url'],
    plugins: [
      {
        resolveId(id) {
          if (id === '@builder.io/qwik/optimizer') {
            return { external: true, id: '../dist-dev/@builder.io-qwik/optimizer.cjs' };
          }
        },
      },
      {
        generateBundle(opts, bundle) {
          for (const b in bundle) {
            const outFile = bundle[b];
            if (!outFile.fileName.endsWith('.d.ts')) {
              outFile.fileName = '../../integration/' + outFile.fileName;
            }
          }
        },
      },
      build.tsPlugin,
    ],
    onwarn,
  };
}

/**
 * Generate/copy assets for package distribution.
 */
function generatePackageFiles() {
  // copy static assets
  ['README.md', 'LICENSE'].forEach((srcFile) =>
    copyFileSync(join(build.rootDir, srcFile), join(build.pkgDir, basename(srcFile)))
  );

  // generate clean package.json
  // npm version command will set the version
  const distPkg = {
    name: pkg.name,
    version: '0.0.0',
    description: pkg.description,
    main: './core.cjs',
    module: './core.mjs',
    types: './core.d.ts',
    type: 'module',
    exports: {
      '.': {
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
      './testing': {
        import: './testing/index.mjs',
        require: './testing/index.cjs',
      },
      './package.json': './package.json',
    },
    contributors: pkg.contributors,
    homepage: pkg.homepage,
    license: pkg.license,
    repository: pkg.repository,
    bugs: pkg.bugs,
    keywords: pkg.keywords,
    engines: pkg.engines,
  };
  writeFileSync(join(build.pkgDir, 'package.json'), JSON.stringify(distPkg, null, 2));

  bundleTypes();
}

/**
 * Generate rolled up dts file and api markdown.
 */
function bundleTypes() {
  if (build.isDev) {
    return;
  }
  const config = ExtractorConfig.loadFileAndPrepare(join(build.rootDir, 'api-extractor.json'));
  config.untrimmedFilePath = join(build.pkgDir, 'core.d.ts');
  const result = Extractor.invoke(config, {
    localBuild: true,
    showVerboseMessages: true,
  });
  if (!result.succeeded) {
    process.exitCode = 1;
  }

  const jsxRuntimeSrcPath = join(build.tsDir, 'src', 'jsx_runtime.d.ts');
  const jsxRuntimeDestPath = join(build.pkgDir, 'jsx-runtime.d.ts');
  copyFileSync(jsxRuntimeSrcPath, jsxRuntimeDestPath);
}

const banner = `
/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
`.trim();

function onwarn(warning, warn) {
  // skip certain warnings
  if (warning.code === `PREFER_NAMED_EXPORTS`) return;
  if (warning.message.includes(`Rollup 'sourcemap'`)) return;
  warn(warning);
}
