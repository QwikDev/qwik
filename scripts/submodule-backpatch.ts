import { join } from 'node:path';
import { build } from 'vite';
import { writeSubmodulePackageJson } from './package-json.ts';
import { getLoaderJsonString, minifyClientScript } from './submodule-qwikloader.ts';
import { type BuildConfig, ensureDir, fileSize, readFile, writeFile } from './util.ts';

const EXECUTORS = [
  ['QWIK_BACKPATCH_EXECUTOR', 'backpatch-executor'],
  ['QWIK_OUT_OF_ORDER_EXECUTOR', 'out-of-order-executor'],
  ['QWIK_ERROR_SWAP_EXECUTOR', 'error-swap-executor'],
] as const;

/** Builds and minifies executor javascript files. This is based off of the qwikloader */
export async function submoduleBackpatch(config: BuildConfig) {
  for (const [, name] of EXECUTORS) {
    await buildExecutor(config, name);
  }

  await generateBackpatchSubmodule(config);
}

async function buildExecutor(config: BuildConfig, name: string) {
  const debugFile = `${name}.debug.js`;
  const minifiedFile = `${name}.js`;
  await build({
    clearScreen: false,
    build: {
      emptyOutDir: false,
      copyPublicDir: false,
      target: 'es2018',
      lib: {
        entry: join(config.srcQwikDir, `${name}.ts`),
        formats: ['es'],
        fileName: () => debugFile,
      },
      minify: false,
      outDir: config.distQwikPkgDir,
    },
  });

  const debugFilePath = join(config.distQwikPkgDir, debugFile);
  const debugContent = await readFile(debugFilePath, 'utf-8');

  const minifyResult = await minifyClientScript(debugContent);

  const minifiedFilePath = join(config.distQwikPkgDir, minifiedFile);
  await writeFile(minifiedFilePath, minifyResult.code || '');

  const size = await fileSize(minifiedFilePath);
  console.log(`-> ${name}:`, size);
}

export async function inlineBackpatchScriptsEsBuild(config: BuildConfig) {
  const define: { [varName: string]: string } = {};

  for (const [globalName, name] of EXECUTORS) {
    define[`globalThis.${globalName}_MINIFIED`] = await getLoaderJsonString(config, `${name}.js`);
    define[`globalThis.${globalName}_DEBUG`] = await getLoaderJsonString(
      config,
      `${name}.debug.js`
    );
  }

  return define;
}

export async function generateBackpatchSubmodule(config: BuildConfig) {
  const backpatchDistDir = join(config.distQwikPkgDir, 'backpatch');

  const code = [
    `const QWIK_BACKPATCH_EXECUTOR_MINIFIED = ${await getLoaderJsonString(config, 'backpatch-executor.js')};`,
    `const QWIK_BACKPATCH_EXECUTOR_DEBUG = ${await getLoaderJsonString(config, 'backpatch-executor.debug.js')};`,
    `globalThis.QWIK_BACKPATCH_EXECUTOR_MINIFIED = QWIK_BACKPATCH_EXECUTOR_MINIFIED;`,
    `globalThis.QWIK_BACKPATCH_EXECUTOR_DEBUG = QWIK_BACKPATCH_EXECUTOR_DEBUG;`,
  ];

  const esmCode = [
    ...code,
    `export { QWIK_BACKPATCH_EXECUTOR_MINIFIED, QWIK_BACKPATCH_EXECUTOR_DEBUG };`,
  ];
  const dtsCode = [
    `export declare const QWIK_BACKPATCH_EXECUTOR_MINIFIED: string;`,
    `export declare const QWIK_BACKPATCH_EXECUTOR_DEBUG: string;`,
  ];

  ensureDir(backpatchDistDir);
  await writeFile(join(backpatchDistDir, 'index.mjs'), esmCode.join('\n') + '\n');
  await writeFile(join(backpatchDistDir, 'index.d.ts'), dtsCode.join('\n') + '\n');

  await writeSubmodulePackageJson(backpatchDistDir, '@qwik.dev/core/backpatch', config.distVersion);
}
