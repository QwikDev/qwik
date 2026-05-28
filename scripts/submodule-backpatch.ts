import { join } from 'node:path';
import { build } from 'vite';
import { writeSubmodulePackageJson } from './package-json.ts';
import { getLoaderJsonString, minifyClientScript } from './submodule-qwikloader.ts';
import { type BuildConfig, ensureDir, fileSize, readFile, writeFile } from './util.ts';

/** Builds and minifies executor javascript files. This is based off of the qwikloader */
export async function submoduleBackpatch(config: BuildConfig) {
  await buildExecutor(config, {
    entry: 'backpatch-executor.ts',
    debugFile: 'backpatch-executor.debug.js',
    minifiedFile: 'backpatch-executor.js',
    label: 'backpatch-executor',
  });

  await buildExecutor(config, {
    entry: 'out-of-order-executor.ts',
    debugFile: 'out-of-order-executor.debug.js',
    minifiedFile: 'out-of-order-executor.js',
    label: 'out-of-order-executor',
  });

  await generateBackpatchSubmodule(config);
}

async function buildExecutor(
  config: BuildConfig,
  opts: {
    entry: string;
    debugFile: string;
    minifiedFile: string;
    label: string;
  }
) {
  await build({
    clearScreen: false,
    build: {
      emptyOutDir: false,
      copyPublicDir: false,
      target: 'es2018',
      lib: {
        entry: join(config.srcQwikDir, opts.entry),
        formats: ['es'],
        fileName: () => opts.debugFile,
      },
      minify: false,
      outDir: config.distQwikPkgDir,
    },
  });

  const debugFilePath = join(config.distQwikPkgDir, opts.debugFile);
  const debugContent = await readFile(debugFilePath, 'utf-8');

  const minifyResult = await minifyClientScript(debugContent);

  const minifiedFilePath = join(config.distQwikPkgDir, opts.minifiedFile);
  await writeFile(minifiedFilePath, minifyResult.code || '');

  const size = await fileSize(minifiedFilePath);
  console.log(`-> ${opts.label}:`, size);
}

export async function inlineBackpatchScriptsEsBuild(config: BuildConfig) {
  const define: { [varName: string]: string } = {};

  define['globalThis.QWIK_BACKPATCH_EXECUTOR_MINIFIED'] = await getLoaderJsonString(
    config,
    'backpatch-executor.js'
  );
  define['globalThis.QWIK_BACKPATCH_EXECUTOR_DEBUG'] = await getLoaderJsonString(
    config,
    'backpatch-executor.debug.js'
  );
  define['globalThis.QWIK_OUT_OF_ORDER_EXECUTOR_MINIFIED'] = await getLoaderJsonString(
    config,
    'out-of-order-executor.js'
  );
  define['globalThis.QWIK_OUT_OF_ORDER_EXECUTOR_DEBUG'] = await getLoaderJsonString(
    config,
    'out-of-order-executor.debug.js'
  );

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
