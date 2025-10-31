import type { Plugin } from 'esbuild';
import { execa, type Options } from 'execa';
import mri from 'mri';
import {
  access as fsAccess,
  copyFile as fsCopyFile,
  mkdir as fsMkdir,
  readdir as fsReaddir,
  readFile as fsReadFile,
  stat as fsStat,
  unlink as fsUnlink,
  writeFile as fsWriteFile,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin as RollupPlugin } from 'rollup';
import { minify, type MinifyOptions } from 'terser';
import { promisify } from 'util';
import { readPackageJson } from './package-json';

const stringOptions = ['distVersion', 'platformTarget', 'setDistTag'] as const;
const booleanOptions = [
  'api',
  'cli',
  'commit',
  'dev',
  'devRelease',
  'dryRun',
  'eslint',
  'esmNode',
  'insights',
  'platformBinding',
  'platformBindingWasmCopy',
  'prepareRelease',
  'qwik',
  'qwikauth',
  'qwikrouter',
  'qwikreact',
  'qwikworker',
  'release',
  'supabaseauthhelpers',
  'tsc',
  'tscDocs',
  'validate',
  'wasm',
  'watch',
] as const;

/**
 * Contains information about the build we're generating by parsing CLI args, and figuring out all
 * the absolute file paths the build will be reading from and writing to.
 */
export type BuildConfig = { [key in (typeof stringOptions)[number]]: string } & {
  [key in (typeof booleanOptions)[number]]?: boolean;
} & {
  distBindingsDir: string;
  distQwikRouterPkgDir: string;
  distQwikPkgDir: string;
  dtsDir: string;
  packagesDir: string;
  rootDir: string;
  scriptsDir: string;
  srcNapiDir: string;
  optimizerDir: string;
  srcQwikRouterDir: string;
  srcQwikDir: string;
  startersDir: string;
  tmpDir: string;
  tscDir: string;
};

const kebab = (str: string) => str.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);

/**
 * Create the `BuildConfig` from the process args, and set the absolute paths the build will be
 * reading from and writing to.
 */
export function loadConfig(args: string[] = []): BuildConfig {
  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const rootDir = join(__dirname, '..');
  const packagesDir = join(rootDir, 'packages');
  const srcQwikDir = join(packagesDir, 'qwik', 'src');
  const optimizerDir = join(packagesDir, 'qwik', 'src', 'optimizer', 'src');
  const distQwikPkgDir = join(packagesDir, 'qwik', 'dist');
  const tmpDir = join(rootDir, 'dist-dev');
  const knownOptions = [...stringOptions, ...booleanOptions] as const;
  const kebabOptions = knownOptions.map(kebab);
  // Add _ to known options
  kebabOptions.push('_');
  const alias = Object.fromEntries(knownOptions.map((k, i) => [kebabOptions[i], k]));
  // rename qwik to build
  (alias as any).build = 'qwik';
  kebabOptions.push('build');
  const config = mri<BuildConfig>(args, {
    boolean: [...booleanOptions],
    string: [...stringOptions],
    alias,
  });
  const parseError =
    config._.length > 0
      ? `!!! Extra non-args: ${config._.join(' ')}\n\n`
      : process.argv.length === 2
        ? `No args provided. `
        : Object.keys(config).some((k) => !kebabOptions.includes(kebab(k)))
          ? `!!! Unknown args: ${Object.keys(config)
              .filter((k) => !kebabOptions.includes(kebab(k)))
              .join(' ')}\n\n`
          : undefined;
  if (parseError) {
    console.error(
      `\n${parseError}Known args:\n${booleanOptions
        .map((k) => `  --${kebab(k)}\n`)
        .join('')}${stringOptions
        .map((k) => `  --${kebab(k)} <string>\n`)
        .join('')}\n=== Use pnpm build.local for initial build. ===\n\n`
    );
    process.exit(1);
  }

  return {
    ...config,
    rootDir,
    packagesDir,
    optimizerDir,
    srcQwikDir,
    tmpDir,
    srcQwikRouterDir: join(packagesDir, 'qwik-router', 'src'),
    srcNapiDir: join(srcQwikDir, 'napi'),
    scriptsDir: join(rootDir, 'scripts'),
    startersDir: join(rootDir, 'starters'),
    distQwikPkgDir,
    distQwikRouterPkgDir: join(packagesDir, 'qwik-router', 'lib'),
    distBindingsDir: join(packagesDir, 'qwik', 'bindings'),
    tscDir: join(tmpDir, 'tsc-out'),
    dtsDir: join(tmpDir, 'dts-out'),
    esmNode: parseInt(process.version.slice(1).split('.')[0], 10) >= 14,
  };
}

export function terser(opts: MinifyOptions): RollupPlugin {
  return {
    name: 'terser',
    async generateBundle(_, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        if (chunk.type === 'chunk') {
          const result = await minify(chunk.code, opts);
          chunk.code = result.code!;
        }
      }
    },
  };
}

/** Esbuild plugin to change an import path, but keep it an external path. */
export function importPath(filter: RegExp, newModulePath: string) {
  const plugin: Plugin = {
    name: 'importPathPlugin',
    setup(build) {
      build.onResolve({ filter }, () => ({
        path: newModulePath,
        external: true,
        sideEffects: false,
      }));
    },
  };
  return plugin;
}

/** Esbuild plugin to mark an import as having external without side effects. */
export function externalImportNoEffects(filter: RegExp) {
  const plugin: Plugin = {
    name: 'externalImportPlugin',
    setup(build) {
      build.onResolve({ filter }, ({ path }) => ({
        path,
        external: true,
        sideEffects: false,
      }));
    },
  };
  return plugin;
}

/** Standard license banner to place at the top of the generated files. */
export const getBanner = (moduleName: string, version: string) => {
  return `
/**
 * @license
 * ${moduleName} ${version}
 * Copyright QwikDev. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/QwikDev/qwik/blob/main/LICENSE
 */
`.trim();
};

/**
 * The JavaScript target we're going for. Reusing a constant just to make sure all the builds are
 * using the same target.
 */
export const target = 'es2020';

export const nodeTarget = 'es2020';

/** Helper just to know which Node.js modules that should stay external. */
export const nodeBuiltIns = [
  'assert',
  'async_hooks',
  'child_process',
  'crypto',
  'fs',
  'module',
  'net',
  'os',
  'path',
  'tty',
  'url',
  'util',
];

/** Utility just to ignore certain rollup warns we already know aren't issues. */
export function rollupOnWarn(warning: any, warn: any) {
  // skip certain warnings
  if (warning.code === `CIRCULAR_DEPENDENCY`) return;
  if (warning.code === `PREFER_NAMED_EXPORTS`) return;
  if (warning.message.includes(`Rollup 'sourcemap'`)) return;
  console.log(warning);
  warn(warning);
}

/** Helper just to get and format a file's size for logging. */
export async function fileSize(filePath: string) {
  const text = await readFile(filePath);
  const { default: compress } = await import('brotli/compress.js');

  const data = compress(text, {
    mode: 1,
    quality: 11,
  });
  return {
    original: formatFileSize(text.length),
    brotli: formatFileSize(data.byteLength),
  };
}

function formatFileSize(bytes: number) {
  if (bytes === 0) return '0b';
  const k = 1024;
  const dm = bytes < k ? 0 : 1;
  const sizes = ['b', 'kb'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + '' + sizes[i];
}

export const access = /*#__PURE__*/ promisify(fsAccess);
export const copyFile = /*#__PURE__*/ promisify(fsCopyFile);
export const readFile = /*#__PURE__*/ promisify(fsReadFile);
export const readdir = /*#__PURE__*/ promisify(fsReaddir);
export const unlink = /*#__PURE__*/ promisify(fsUnlink);
export const stat = /*#__PURE__*/ promisify(fsStat);
export const writeFile = /*#__PURE__*/ promisify(fsWriteFile);
export const mkdir = /*#__PURE__*/ promisify(fsMkdir);

export function emptyDir(dir: string) {
  try {
    rmSync(dir, { recursive: true });
  } catch (e) {}
  ensureDir(dir);
}

export function ensureDir(dir: string) {
  try {
    mkdirSync(dir, { recursive: true });
  } catch (e) {}
}

export async function run(
  cmd: string,
  args: string[],
  skipExecution?: boolean,
  dryRunCliFlag?: boolean,
  opts?: Options
) {
  if (dryRunCliFlag) {
    args = [...args, '--dry-run'];
  }
  const bash = `   ${cmd} ${args.join(' ')}`;
  console.log(bash, opts ? JSON.stringify(opts) : '');
  if (!skipExecution) {
    const result = await execa(cmd, args, opts);
    if (result.failed) {
      panic(`Finished with error: ${bash}`);
    }
  }
}

export function panic(msg: string | Error) {
  const err = typeof msg === 'string' ? new Error(msg) : msg;
  console.error(`\n❌ `, err);
  process.exit(1);
}

/** Interface for package.json */
export interface PackageJSON {
  name: string;
  version: string;
  dependencies?: { [pkgName: string]: string };
  devDependencies?: { [pkgName: string]: string };
  description?: string;
  scripts?: { [scriptName: string]: string };
  license?: string;
  main: string;
  module?: string;
  types: string;
  type?: string;
  files?: string[];
  exports?: { [key: string]: any };
  contributors?: { [key: string]: string }[];
  homepage?: string;
  repository?: { [key: string]: string };
  bugs?: { [key: string]: string };
  keywords?: string[];
  engines?: { [key: string]: string };
  private?: boolean;
  [key: string]: any;
}

export async function copyDir(config: BuildConfig, srcDir: string, destDir: string) {
  await mkdir(destDir);
  const items = await readdir(srcDir);
  await Promise.all(
    items.map(async (itemName) => {
      if (!IGNORE[itemName] && !itemName.includes('.test')) {
        const srcPath = join(srcDir, itemName);
        const destPath = join(destDir, itemName);
        const itemStat = await stat(srcPath);
        if (itemStat.isDirectory()) {
          await copyDir(config, srcPath, destPath);
        } else if (itemStat.isFile()) {
          await copyFile(srcPath, destPath);
        }
      }
    })
  );
}

const IGNORE: { [path: string]: boolean } = {
  '.rollup.cache': true,
  build: true,
  server: true,
  e2e: true,
  node_modules: true,
  'package-lock.json': true,
  'starter.tsconfig.json': true,
  'tsconfig.tsbuildinfo': true,
  'yarn.lock': true,
  'pnpm-lock.yaml': true,
};

export const recursiveChangePrefix = <T>(obj: T, prefix: string, replace: string): T => {
  if (typeof obj === 'string') {
    return (obj.startsWith(prefix) ? replace + obj.slice(prefix.length) : obj) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => recursiveChangePrefix(v, prefix, replace)) as T;
  }
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, recursiveChangePrefix(v, prefix, replace)])
    ) as T;
  }
  return obj;
};

export async function getQwikVersion(config: BuildConfig) {
  const qwikDir = join(config.packagesDir, 'qwik');
  const qwikPkgJson = await readPackageJson(qwikDir);
  return qwikPkgJson.version;
}
