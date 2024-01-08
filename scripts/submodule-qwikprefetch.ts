import { type InputOptions, type OutputOptions, rollup } from 'rollup';
import {
  type BuildConfig,
  ensureDir,
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
 * Builds the qwikprefetch javascript files. These files can be used by other tooling, and are
 * provided in the package so CDNs could point to them. The @builder.io/optimizer submodule also
 * provides a utility function.
 */
export async function submoduleQwikPrefetch(config: BuildConfig) {
  const prefetchSwDir = join(config.srcQwikDir, 'prefetch-service-worker');
  const input: InputOptions = {
    input: join(prefetchSwDir, 'entry.ts'),
    plugins: [
      {
        name: 'qwikPrefetchTranspile',
        resolveId(id) {
          if (!id.endsWith('.ts')) {
            return join(prefetchSwDir, id + '.ts');
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
    // QWIK_PREFETCH_DEFAULT_MINIFIED
    dir: config.distQwikPkgDir,
    format: 'es',
    entryFileNames: `qwik-prefetch.js`,
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
        mangle: {
          toplevel: true,
          module: true,
          properties: {
            regex: '^\\$.+\\$$',
          },
        },
        format: {
          comments: /@vite/,
        },
      }),
    ],
  };

  const defaultDebug: OutputOptions = {
    // QWIK_PREFETCH_DEFAULT_DEBUG
    dir: config.distQwikPkgDir,
    format: 'es',
    entryFileNames: `qwik-prefetch.debug.js`,
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

  await generatePrefetchSubmodule(config);
}

/** Load each of the qwik scripts to be inlined with esbuild "define" as const variables. */
export async function inlineQwikScriptsEsBuild(config: BuildConfig) {
  const variableToFileMap = [
    ['QWIK_PREFETCH_DEFAULT_MINIFIED', 'qwik-prefetch.js'],
    ['QWIK_PREFETCH_DEFAULT_DEBUG', 'qwik-prefetch.debug.js'],
  ];

  const define: { [varName: string]: string } = {};

  await Promise.all(
    variableToFileMap.map(async (varToFile) => {
      const varName = `globalThis.${varToFile[0]}`;
      const filePath = join(config.distQwikPkgDir, varToFile[1]);
      const content = await readFile(filePath, 'utf-8');
      define[varName] = JSON.stringify(content.trim());
    })
  );

  return define;
}

async function generatePrefetchSubmodule(config: BuildConfig) {
  const prefetchDistDir = join(config.distQwikPkgDir, 'prefetch');

  const prefetchCode = await readFile(join(config.distQwikPkgDir, 'qwik-prefetch.js'), 'utf-8');
  const prefetchDebugCode = await readFile(
    join(config.distQwikPkgDir, 'qwik-prefetch.debug.js'),
    'utf-8'
  );

  const code = [
    `const QWIK_PREFETCH = ${JSON.stringify(prefetchCode.trim())};`,
    `const QWIK_PREFETCH_DEBUG = ${JSON.stringify(prefetchDebugCode.trim())};`,
  ];

  const esmCode = [...code, `export { QWIK_PREFETCH, QWIK_PREFETCH_DEBUG };`];
  const cjsCode = [
    ...code,
    `exports.QWIK_PREFETCH = QWIK_PREFETCH;`,
    `exports.QWIK_PREFETCH_DEBUG = QWIK_PREFETCH_DEBUG;`,
  ];
  const dtsCode = [
    `export declare const QWIK_PREFETCH: string;`,
    `export declare const QWIK_PREFETCH_DEBUG: string;`,
  ];

  ensureDir(prefetchDistDir);
  await writeFile(join(prefetchDistDir, 'index.mjs'), esmCode.join('\n') + '\n');
  await writeFile(join(prefetchDistDir, 'index.cjs'), cjsCode.join('\n') + '\n');
  await writeFile(join(prefetchDistDir, 'index.d.ts'), dtsCode.join('\n') + '\n');

  const prefetchPkg: PackageJSON = {
    name: `@builder.io/qwik/prefetch`,
    version: config.distVersion,
    main: `index.mjs`,
    types: `index.d.ts`,
    private: true,
    type: 'module',
  };
  await writePackageJson(prefetchDistDir, prefetchPkg);
}
