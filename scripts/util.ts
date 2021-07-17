import type { Plugin, WatchMode } from 'esbuild';
import { join } from 'path';
import mri from 'mri';
import { stat } from 'fs/promises';

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
  dev?: boolean;
  watch?: boolean;
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

/**
 * Helper just to know which NodeJS modules that should stay external.
 */
export const nodeBuiltIns = ['child_process', 'crypto', 'fs', 'module', 'os', 'path', 'tty', 'url'];

export function injectDirname(config: BuildConfig) {
  return join(config.scriptsDir, 'shim', '__dirname.js');
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
