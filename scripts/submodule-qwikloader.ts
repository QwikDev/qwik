import { InputOptions, OutputOptions, rollup } from 'rollup';
import {
  BuildConfig,
  ensureDir,
  fileSize,
  PackageJSON,
  readFile,
  rollupOnWarn,
  terser,
  writeFile,
} from './util';
import { join } from 'path';
import { transform } from 'esbuild';
import { writePackageJson } from './package-json';

/**
 * Builds the qwikloader javascript files. These files can be used
 * by other tooling, and are provided in the package so CDNs could
 * point to them. The @builder.io/optimizer submodule also provides
 * a utility function.
 */
export async function submoduleQwikLoader(config: BuildConfig) {
  const input: InputOptions = {
    input: join(config.srcDir, 'qwikloader-entry.ts'),
    plugins: [
      {
        name: 'qwikloaderTranspile',
        resolveId(id) {
          if (!id.endsWith('.ts')) {
            return join(config.srcDir, id + '.ts');
          }
          return null;
        },
        async transform(code, id) {
          const result = await transform(code, {
            sourcefile: id,
            target: 'es2017',
            format: 'esm',
            loader: 'ts',
          });
          return result.code;
        },
      },
    ],
    onwarn: rollupOnWarn,
  };

  const defaultMinified: OutputOptions = {
    // QWIK_LOADER_DEFAULT_MINIFIED
    dir: config.distPkgDir,
    format: 'es',
    entryFileNames: `qwikloader.js`,
    exports: 'none',
    intro: `(()=>{`,
    outro: `})()`,
    plugins: [
      terser({
        compress: {
          global_defs: {
            'window.BuildEvents': false,
          },
          keep_fargs: false,
          unsafe: true,
          passes: 2,
        },
        format: {
          comments: /@vite/,
        },
      }),
    ],
  };

  const defaultDebug: OutputOptions = {
    // QWIK_LOADER_DEFAULT_DEBUG
    dir: config.distPkgDir,
    format: 'es',
    entryFileNames: `qwikloader.debug.js`,
    exports: 'none',
    intro: `(()=>{`,
    outro: `})()`,
    plugins: [
      terser({
        compress: {
          global_defs: {
            'window.BuildEvents': false,
          },
          inline: false,
          join_vars: false,
          loops: false,
          sequences: false,
        },
        format: {
          comments: true,
          beautify: true,
          braces: true,
        },
        mangle: false,
      }),
    ],
  };

  const optimizeMinified: OutputOptions = {
    // QWIK_LOADER_OPTIMIZE_MINIFIED
    dir: config.distPkgDir,
    format: 'es',
    entryFileNames: `qwikloader.optimize.js`,
    exports: 'none',
    intro: `(()=>{`,
    outro: `})()`,
    plugins: [
      terser({
        compress: {
          global_defs: {
            'window.BuildEvents': true,
          },
          keep_fargs: false,
          unsafe: true,
          passes: 2,
        },
        format: {
          comments: /@vite-ignore/g,
        },
      }),
    ],
  };

  const optimizeDebug: OutputOptions = {
    // QWIK_LOADER_OPTIMIZE_DEBUG
    dir: config.distPkgDir,
    format: 'es',
    entryFileNames: `qwikloader.optimize.debug.js`,
    exports: 'none',
    intro: `(()=>{`,
    outro: `})()`,
    plugins: [
      terser({
        compress: {
          global_defs: {
            'window.BuildEvents': true,
          },
          inline: false,
          join_vars: false,
          loops: false,
          sequences: false,
        },
        format: {
          comments: /@vite-ignore/g,
          beautify: true,
          braces: true,
        },
        mangle: false,
      }),
    ],
  };

  const build = await rollup(input);

  await Promise.all([
    build.write(defaultMinified),
    build.write(defaultDebug),
    build.write(optimizeMinified),
    build.write(optimizeDebug),
  ]);

  await generateLoaderSubmodule(config);

  const optimizeFileSize = await fileSize(join(config.distPkgDir, 'qwikloader.optimize.js'));
  console.log(`🐸 qwikloader:`, optimizeFileSize);
}

/**
 * Load each of the qwik scripts to be inlined with esbuild "define" as const varialbles.
 */
export async function inlineQwikScriptsEsBuild(config: BuildConfig) {
  const variableToFileMap = [
    ['QWIK_LOADER_DEFAULT_MINIFIED', 'qwikloader.js'],
    ['QWIK_LOADER_DEFAULT_DEBUG', 'qwikloader.debug.js'],
    ['QWIK_LOADER_OPTIMIZE_MINIFIED', 'qwikloader.optimize.js'],
    ['QWIK_LOADER_OPTIMIZE_DEBUG', 'qwikloader.optimize.debug.js'],
  ];

  const define: { [varName: string]: string } = {};

  await Promise.all(
    variableToFileMap.map(async (varToFile) => {
      const varName = `global.${varToFile[0]}`;
      const filePath = join(config.distPkgDir, varToFile[1]);
      const content = await readFile(filePath, 'utf-8');
      define[varName] = JSON.stringify(content.trim());
    })
  );

  return define;
}

async function generateLoaderSubmodule(config: BuildConfig) {
  const loaderDistDir = join(config.distPkgDir, 'loader');

  const loaderCode = await readFile(join(config.distPkgDir, 'qwikloader.js'), 'utf-8');
  const loaderDebugCode = await readFile(join(config.distPkgDir, 'qwikloader.debug.js'), 'utf-8');

  const code = [
    `const QWIK_LOADER = ${JSON.stringify(loaderCode.trim())};`,
    `const QWIK_LOADER_DEBUG = ${JSON.stringify(loaderDebugCode.trim())};`,
  ];

  const esmCode = [...code, `export { QWIK_LOADER, QWIK_LOADER_DEBUG };`];
  const cjsCode = [
    ...code,
    `exports.QWIK_LOADER = QWIK_LOADER;`,
    `exports.QWIK_LOADER_DEBUG = QWIK_LOADER_DEBUG;`,
  ];
  const dtsCode = [
    `export declare const QWIK_LOADER: string;`,
    `export declare const QWIK_LOADER_DEBUG: string;`,
  ];

  ensureDir(loaderDistDir);
  await writeFile(join(loaderDistDir, 'index.mjs'), esmCode.join('\n') + '\n');
  await writeFile(join(loaderDistDir, 'index.cjs'), cjsCode.join('\n') + '\n');
  await writeFile(join(loaderDistDir, 'index.d.ts'), dtsCode.join('\n') + '\n');

  const loaderPkg: PackageJSON = {
    name: `@builder.io/qwik/loader`,
    version: config.distVersion,
    main: `index.cjs`,
    module: `index.mjs`,
    types: `index.d.ts`,
    private: true,
  };
  await writePackageJson(loaderDistDir, loaderPkg);
}
