import { join } from 'node:path';
import { build } from 'vite';
import { writePackageJson } from './package-json';
import { getLoaderJsonString, minifyClientScript } from './submodule-qwikloader';
import {
  type BuildConfig,
  ensureDir,
  fileSize,
  type PackageJSON,
  readFile,
  writeFile,
} from './util';

/** Builds and minifies the backpatch executor javascript files. This is based off of the qwikloader */
export async function submoduleBackpatch(config: BuildConfig) {
  await build({
    build: {
      emptyOutDir: false,
      copyPublicDir: false,
      target: 'es2018',
      lib: {
        entry: join(config.srcQwikDir, 'backpatch-executor.ts'),
        formats: ['es'],
        fileName: () => 'backpatch-executor.debug.js',
      },
      minify: false,
      outDir: config.distQwikPkgDir,
    },
  });

  const debugFilePath = join(config.distQwikPkgDir, 'backpatch-executor.debug.js');
  const debugContent = await readFile(debugFilePath, 'utf-8');

  const minifyResult = await minifyClientScript(debugContent);

  const minifiedFilePath = join(config.distQwikPkgDir, 'backpatch-executor.js');
  await writeFile(minifiedFilePath, minifyResult.code || '');

  const backpatchSize = await fileSize(join(config.distQwikPkgDir, 'backpatch-executor.js'));
  console.log(`🔄 backpatch-executor:`, backpatchSize);

  await generateBackpatchSubmodule(config);
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

  const backpatchPkg: PackageJSON = {
    name: `@qwik.dev/core/backpatch`,
    version: config.distVersion,
    main: `index.mjs`,
    types: `index.d.ts`,
    private: true,
    type: 'module',
  };
  await writePackageJson(backpatchDistDir, backpatchPkg);
}
