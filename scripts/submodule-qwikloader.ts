import { join } from 'node:path';
import { minify } from 'terser';
import { build } from 'vite';
import { writePackageJson } from './package-json';
import {
  type BuildConfig,
  ensureDir,
  fileSize,
  type PackageJSON,
  readFile,
  writeFile,
} from './util';

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

  // Create the minified version using shared terser config
  const minifyResult = await minifyClientScript(debugContent);

  // Write the minified version
  const minifiedFilePath = join(config.distQwikPkgDir, 'qwikloader.js');
  await writeFile(minifiedFilePath, minifyResult.code || '');

  await generateLoaderSubmodule(config);

  const loaderSize = await fileSize(join(config.distQwikPkgDir, 'qwikloader.js'));
  console.log(`🐸 qwikloader:`, loaderSize);
}

export const getTerserConfig = () => ({
  compress: {
    global_defs: {
      'window.BuildEvents': false,
    },
    keep_fargs: false,
    unsafe: true,
    passes: 2,
  },
  mangle: {
    keep_fnames: false,
    properties: false,
    toplevel: true,
  },
  // format: { semicolons: false }, // uncomment to understand minified version better
});

/** Minify JavaScript content using the shared configuration */
export const minifyClientScript = async (content: string) => {
  return await minify(content, getTerserConfig());
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
    name: `@qwik.dev/core/loader`,
    version: config.distVersion,
    main: `index.mjs`,
    types: `index.d.ts`,
    private: true,
    type: 'module',
  };
  await writePackageJson(loaderDistDir, loaderPkg);
}
