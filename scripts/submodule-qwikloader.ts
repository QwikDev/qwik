import { transform } from 'esbuild';
import { join } from 'node:path';
import { build } from 'vite';
import { writeSubmodulePackageJson } from './package-json.ts';
import {
  type BuildConfig,
  ESBUILD_BASE,
  ensureDir,
  fileSize,
  readFile,
  writeFile,
} from './util.ts';

/**
 * Builds the qwikloader javascript files. These files can be used by other tooling, and are
 * provided in the package so CDNs could point to them. The @qwik.dev/core/optimizer submodule also
 * provides a utility function.
 */
export async function submoduleQwikLoader(config: BuildConfig) {
  // Build the debug version first
  await build({
    build: {
      emptyOutDir: false,
      copyPublicDir: false,
      target: 'es2020',
      lib: {
        entry: join(config.srcQwikDir, 'qwikloader.ts'),
        formats: ['es'],
        fileName: () => 'qwikloader.debug.js',
      },
      minify: false,
      outDir: config.distQwikPkgDir,
    },
  });

  // Read the debug version
  const debugFilePath = join(config.distQwikPkgDir, 'qwikloader.debug.js');
  const debugContent = await readFile(debugFilePath, 'utf-8');

  // Create the minified version using the shared esbuild config
  const minifyResult = await minifyClientScript(debugContent);

  // Write the minified version
  const minifiedFilePath = join(config.distQwikPkgDir, 'qwikloader.js');
  await writeFile(minifiedFilePath, minifyResult.code || '');

  await generateLoaderSubmodule(config);

  const loaderSize = await fileSize(join(config.distQwikPkgDir, 'qwikloader.js'));
  console.log(`🐸 qwikloader:`, loaderSize);
}

/** Minify a client script (qwikloader/backpatch) with esbuild. No property mangling. */
export const minifyClientScript = async (content: string) => {
  const result = await transform(content, {
    ...ESBUILD_BASE,
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: true,
    legalComments: 'none',
    define: { 'window.BuildEvents': 'false' },
  });
  return { code: result.code };
};

export const getLoaderJsonString = async (config: BuildConfig, name: string) => {
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
  const dtsCode = [
    `export declare const QWIK_LOADER: string;`,
    `export declare const QWIK_LOADER_DEBUG: string;`,
  ];

  ensureDir(loaderDistDir);
  await writeFile(join(loaderDistDir, 'index.mjs'), esmCode.join('\n') + '\n');
  await writeFile(join(loaderDistDir, 'index.d.ts'), dtsCode.join('\n') + '\n');

  await writeSubmodulePackageJson(loaderDistDir, '@qwik.dev/core/loader', config.distVersion);
}
