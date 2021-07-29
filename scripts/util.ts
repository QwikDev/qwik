import type { Plugin, WatchMode } from 'esbuild';
import { join } from 'path';
import mri from 'mri';
import {
  access as fsAccess,
  copyFile as fsCopyFile,
  existsSync,
  readdirSync,
  readFile as fsReadFile,
  readFileSync,
  rmdirSync,
  stat as fsStat,
  statSync,
  unlinkSync,
  writeFile as fsWriteFile,
} from 'fs';
import { promisify } from 'util';

/**
 * Contains information about the build we're generating by parsing
 * CLI args, and figuring out all the absolute file paths the
 * build will be reading from and writing to.
 */
export interface BuildConfig {
  rootDir: string;
  distDir: string;
  srcDir: string;
  scriptsDir: string;
  tscDir: string;
  pkgDir: string;
  esmNode: boolean;

  api?: boolean;
  build?: boolean;
  dev?: boolean;
  jsx?: boolean;
  tsc?: boolean;
  validate?: boolean;
  watch?: boolean;
}

/**
 * Create the `BuildConfig` from the process args, and set the
 * absolute paths the build will be reading from and writing to.
 */
export function loadConfig(args: string[] = []) {
  const config: BuildConfig = mri(args) as any;

  config.rootDir = join(__dirname, '..');
  config.distDir = join(config.rootDir, 'dist-dev');
  config.srcDir = join(config.rootDir, 'src');
  config.scriptsDir = join(config.rootDir, 'scripts');
  config.pkgDir = join(config.distDir, '@builder.io-qwik');
  config.tscDir = join(config.distDir, 'tsc-out');
  config.esmNode = parseInt(process.version.substr(1).split('.')[0], 10) >= 14;

  return config;
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
 * Esbuild plugin to print out console logs the rebuild has finished or if it has errors.
 */
export function watcher(config: BuildConfig, filename?: string): WatchMode | boolean {
  if (config.watch) {
    return {
      onRebuild(error) {
        if (error) console.error('watch build failed:', error);
        else {
          if (filename) console.log('rebuilt:', filename);
        }
      },
    };
  }
  return false;
}

/**
 * Load each of the qwik scripts to be inlined with esbuild "define" as const varialbles.
 */
export function inlineQwikScripts(config: BuildConfig) {
  return {
    'global.QWIK_LOADER_DEFAULT_MINIFIED': JSON.stringify(
      readFileSync(join(config.pkgDir, 'qwikloader.js'), 'utf-8').trim()
    ),
    'global.QWIK_LOADER_DEFAULT_DEBUG': JSON.stringify(
      readFileSync(join(config.pkgDir, 'qwikloader.debug.js'), 'utf-8').trim()
    ),
    'global.QWIK_LOADER_OPTIMIZE_MINIFIED': JSON.stringify(
      readFileSync(join(config.pkgDir, 'qwikloader.optimize.js'), 'utf-8').trim()
    ),
    'global.QWIK_LOADER_OPTIMIZE_DEBUG': JSON.stringify(
      readFileSync(join(config.pkgDir, 'qwikloader.optimize.debug.js'), 'utf-8').trim()
    ),
  };
}

/**
 * Standard license banner to place at the top of the generated files.
 */
export const banner = {
  js: `
/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
`.trim(),
};

/**
 * The JavaScript target we're going for. Reusing a constant just to make sure
 * all the builds are using the same target.
 */
export const target = 'es2018';

export const nodeTarget = 'node10';

/**
 * Helper just to know which NodeJS modules that should stay external.
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

export function injectDirname(config: BuildConfig) {
  return join(config.scriptsDir, 'shim', '__dirname.js');
}

export function injectGlobalThisPoly(config: BuildConfig) {
  return join(config.scriptsDir, 'shim', 'globalthis.js');
}

/**
 * Utility just to ignore certain rollup warns we already know aren't issues.
 */
export function rollupOnWarn(warning: any, warn: any) {
  // skip certain warnings
  if (warning.code === `PREFER_NAMED_EXPORTS`) return;
  if (warning.message.includes(`Rollup 'sourcemap'`)) return;
  warn(warning);
}

/**
 * Helper just to get and format a file's size for logging.
 */
export async function fileSize(filePath: string) {
  const bytes = (await stat(filePath)).size;
  if (bytes === 0) return '0b';
  const k = 1024;
  const dm = bytes < k ? 0 : 1;
  const sizes = ['b', 'kb'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + '' + sizes[i];
}

export const access = promisify(fsAccess);
export const copyFile = promisify(fsCopyFile);
export const readFile = promisify(fsReadFile);
export const stat = promisify(fsStat);
export const writeFile = promisify(fsWriteFile);

export function emptyDir(dir: string) {
  if (existsSync(dir)) {
    const items = readdirSync(dir).map((f) => join(dir, f));
    for (const item of items) {
      const s = statSync(item);
      if (s.isDirectory()) {
        emptyDir(item);
        rmdirSync(item);
      } else if (s.isFile()) {
        unlinkSync(item);
      }
    }
  }
}

/**
 * Interface for package.json
 */
export interface PackageJSON {
  name: string;
  version: string;
  description: string;
  license: string;
  main: string;
  module: string;
  types: string;
  type: string;
  files: string[];
  exports: { [key: string]: string | { [key: string]: string } };
  contributors: { [key: string]: string }[];
  homepage: string;
  repository: { [key: string]: string };
  bugs: { [key: string]: string };
  keywords: string[];
  engines: { [key: string]: string };
}
