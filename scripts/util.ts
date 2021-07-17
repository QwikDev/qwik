import type { Plugin, WatchMode } from 'esbuild';
import { join } from 'path';
import mri from 'mri';
import { stat } from 'fs/promises';

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

export function watcher(config: BuildConfig, filename?: string): WatchMode | boolean {
  if (config.watch) {
    return {
      onRebuild(error, result) {
        if (error) console.error('watch build failed:', error);
        else {
          if (filename) console.log('rebuilt:', filename);
        }
      },
    };
  }
  return false;
}

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

export const target = 'es2018';

export const nodeBuiltIns = ['child_process', 'crypto', 'fs', 'module', 'os', 'path', 'tty', 'url'];

export function injectDirname(config: BuildConfig) {
  return join(config.scriptsDir, 'shim', '__dirname.js');
}

export function rollupOnWarn(warning: any, warn: any) {
  // skip certain warnings
  if (warning.code === `PREFER_NAMED_EXPORTS`) return;
  if (warning.message.includes(`Rollup 'sourcemap'`)) return;
  warn(warning);
}

export async function fileSize(filePath: string) {
  const bytes = (await stat(filePath)).size;
  if (bytes === 0) return '0b';
  const k = 1024;
  const dm = bytes < k ? 0 : 1;
  const sizes = ['b', 'kb'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + '' + sizes[i];
}
