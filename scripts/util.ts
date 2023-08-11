import type { Plugin } from 'esbuild';
import { join } from 'node:path';
import mri from 'mri';
import {
  access as fsAccess,
  copyFile as fsCopyFile,
  existsSync,
  mkdirSync,
  readdirSync,
  readdir as fsReaddir,
  readFile as fsReadFile,
  rmdirSync,
  stat as fsStat,
  statSync,
  unlink as fsUnlink,
  unlinkSync,
  writeFile as fsWriteFile,
  mkdir as fsMkdir,
} from 'node:fs';
import { promisify } from 'util';
import { minify, type MinifyOptions } from 'terser';
import type { Plugin as RollupPlugin } from 'rollup';
import { execa, type Options } from 'execa';
import { fileURLToPath } from 'node:url';

/**
 * Contains information about the build we're generating by parsing
 * CLI args, and figuring out all the absolute file paths the
 * build will be reading from and writing to.
 */
export interface BuildConfig {
  rootDir: string;
  packagesDir: string;
  tmpDir: string;
  srcNapiDir: string;
  srcQwikDir: string;
  srcQwikCityDir: string;
  srcQwikLabsDir: string;
  scriptsDir: string;
  startersDir: string;
  tscDir: string;
  dtsDir: string;
  distQwikPkgDir: string;
  distQwikCityPkgDir: string;
  distBindingsDir: string;
  esmNode: boolean;
  distVersion: string;
  platformTarget?: string;

  api?: boolean;
  build?: boolean;
  qwikcity?: boolean;
  qwikreact?: boolean;
  qwiklabs?: boolean;
  qwikauth?: boolean;
  qwikworker?: boolean;
  supabaseauthhelpers?: boolean;
  cli?: boolean;
  eslint?: boolean;
  commit?: boolean;
  dev?: boolean;
  dryRun?: boolean;
  platformBinding?: boolean;
  platformBindingWasmCopy?: boolean;
  prepareRelease?: boolean;
  release?: boolean;
  devRelease?: boolean;
  setDistTag?: string;
  tsc?: boolean;
  validate?: boolean;
  wasm?: boolean;
  watch?: boolean;
}

/**
 * Create the `BuildConfig` from the process args, and set the
 * absolute paths the build will be reading from and writing to.
 */
export function loadConfig(args: string[] = []) {
  const config: BuildConfig = mri(args) as any;
  const __dirname = fileURLToPath(new URL('.', import.meta.url));

  config.rootDir = join(__dirname, '..');
  config.packagesDir = join(config.rootDir, 'packages');
  config.tmpDir = join(config.rootDir, 'dist-dev');
  config.srcQwikDir = join(config.packagesDir, 'qwik', 'src');
  config.srcQwikCityDir = join(config.packagesDir, 'qwik-city');
  config.srcQwikLabsDir = join(config.packagesDir, 'qwik-labs');
  config.srcNapiDir = join(config.srcQwikDir, 'napi');
  config.scriptsDir = join(config.rootDir, 'scripts');
  config.startersDir = join(config.rootDir, 'starters');
  config.distQwikPkgDir = join(config.packagesDir, 'qwik', 'dist');
  config.distQwikCityPkgDir = join(config.packagesDir, 'qwik-city', 'lib');
  config.distBindingsDir = join(config.distQwikPkgDir, 'bindings');
  config.tscDir = join(config.tmpDir, 'tsc-out');
  config.dtsDir = join(config.tmpDir, 'dts-out');
  config.esmNode = parseInt(process.version.slice(1).split('.')[0], 10) >= 14;
  config.platformBinding = (config as any)['platform-binding'];
  config.platformBindingWasmCopy = (config as any)['platform-binding-wasm-copy'];
  config.prepareRelease = (config as any)['prepare-release'];
  config.platformTarget = (config as any)['platform-target'];
  config.setDistTag = (config as any)['set-dist-tag'];
  config.devRelease = !!(config as any)['dev-release'];
  config.dryRun = (config as any)['dry-run'];

  return config;
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

/**
 * Esbuild plugin to change an import path, but keep it an external path.
 */
export function importPath(filter: RegExp, newModulePath: string) {
  const plugin: Plugin = {
    name: 'importPathPlugin',
    setup(build) {
      build.onResolve({ filter }, () => ({
        path: newModulePath,
        external: true,
      }));
    },
  };
  return plugin;
}

/**
 * Standard license banner to place at the top of the generated files.
 */
export const getBanner = (moduleName: string, version: string) => {
  return `
/**
 * @license
 * ${moduleName} ${version}
 * Copyright Builder.io, Inc. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
`.trim();
};

/**
 * The JavaScript target we're going for. Reusing a constant just to make sure
 * all the builds are using the same target.
 */
export const target = 'es2020';

export const nodeTarget = 'node14';

/**
 * Helper just to know which Node.js modules that should stay external.
 */
export const nodeBuiltIns = [
  'assert',
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

/**
 * Utility just to ignore certain rollup warns we already know aren't issues.
 */
export function rollupOnWarn(warning: any, warn: any) {
  // skip certain warnings
  if (warning.code === `CIRCULAR_DEPENDENCY`) return;
  if (warning.code === `PREFER_NAMED_EXPORTS`) return;
  if (warning.message.includes(`Rollup 'sourcemap'`)) return;
  console.log(warning);
  warn(warning);
}

/**
 * Helper just to get and format a file's size for logging.
 */
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
  if (existsSync(dir)) {
    const items = readdirSync(dir).map((f) => join(dir, f));
    for (const item of items) {
      const s = statSync(item);
      if (s.isDirectory()) {
        emptyDir(item);
        try {
          rmdirSync(item);
        } catch (e) {}
      } else if (s.isFile()) {
        unlinkSync(item);
      }
    }
  } else {
    ensureDir(dir);
  }
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

export function panic(msg: string) {
  console.error(`\n❌ ${msg}\n`, new Error(msg).stack);
  process.exit(1);
}

/**
 * Interface for package.json
 */
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
