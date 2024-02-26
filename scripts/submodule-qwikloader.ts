import { type InputOptions, type OutputOptions, rollup } from 'rollup';
import {
  type BuildConfig,
  ensureDir,
  fileSize,
  type PackageJSON,
  readFile,
  rollupOnWarn,
  terser,
  writeFile,
} from './util';
import { join } from 'node:path';
import { transform } from 'esbuild';
import { writePackageJson } from './package-json';

/**
 * Builds the qwikloader javascript files. These files can be used by other tooling, and are
 * provided in the package so CDNs could point to them. The @builder.io/optimizer submodule also
 * provides a utility function.
 */
export async function submoduleQwikLoader(config: BuildConfig) {
  const input: InputOptions = {
    input: join(config.srcQwikDir, 'qwikloader-entry.ts'),
    plugins: [
      {
        name: 'qwikloaderTranspile',
        resolveId(id) {
          if (!id.endsWith('.ts')) {
            return join(config.srcQwikDir, id + '.ts');
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
    dir: config.distQwikPkgDir,
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
    dir: config.distQwikPkgDir,
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

  const build = await rollup(input);

  await Promise.all([build.write(defaultMinified), build.write(defaultDebug)]);

  await generateLoaderSubmodule(config);

  const loaderSize = await fileSize(join(config.distQwikPkgDir, 'qwikloader.js'));
  console.log(`🐸 qwikloader:`, loaderSize);
}

const getLoaderJsonString = async (config: BuildConfig, name: string) => {
  const filePath = join(config.distQwikPkgDir, name);
  const content = await readFile(filePath, 'utf-8');
  // Remove vite comments and leading/trailing whitespace
  let cleaned = content.trim().replace(/\n?\/\*\s*@vite[^*]+\*\/\n?/g, '');
  if (cleaned.endsWith(';')) {
    cleaned = cleaned.slice(0, -1);
  }
  return JSON.stringify(cleaned);
};
/** Load each of the qwik scripts to be inlined with esbuild "define" as const variables. */
export async function inlineQwikScriptsEsBuild(config: BuildConfig) {
  const variableToFileMap = [
    ['QWIK_LOADER_DEFAULT_MINIFIED', 'qwikloader.js'],
    ['QWIK_LOADER_DEFAULT_DEBUG', 'qwikloader.debug.js'],
  ];

  const define: { [varName: string]: string } = {};

  await Promise.all(
    variableToFileMap.map(async (varToFile) => {
      const varName = `globalThis.${varToFile[0]}`;
      define[varName] = await getLoaderJsonString(config, varToFile[1]);
    })
  );

  return define;
}

async function generateLoaderSubmodule(config: BuildConfig) {
  const loaderDistDir = join(config.distQwikPkgDir, 'loader');

  const code = [
    `const QWIK_LOADER = ${await getLoaderJsonString(config, 'qwikloader.js')};`,
    `const QWIK_LOADER_DEBUG = ${await getLoaderJsonString(config, 'qwikloader.debug.js')};`,
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
    main: `index.mjs`,
    types: `index.d.ts`,
    private: true,
    type: 'module',
  };
  await writePackageJson(loaderDistDir, loaderPkg);
}
