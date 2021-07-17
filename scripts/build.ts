import { buildDevServer } from './devserver';
import { copyFiles } from './copy-files';
import { generatePackageJson } from './package-json';
import { submoduleCore } from './submodule-core';
import { submoduleJsxRuntime } from './submodule-jsx-runtime';
import { submoduleOptimizer } from './submodule-optimizer';
import { submoduleQwikLoader } from './submodule-qwikloader';
import { submoduleServer } from './submodule-server';
import { submoduleTesting } from './submodule-testing';
import { mkdirSync, rmSync } from 'fs';
import type { BuildConfig } from './util';

/**
 * Complete a full build for all of the package's submodules. Passed in
 * config has all the correct absolute paths to read from and write to.
 * Additionally, a dev build does not empty the directory, and uses
 * esbuild for each of the submodules for speed. A production build will
 * use TSC + Rollup + Terser for the core submodule.
 */
export async function build(config: BuildConfig) {
  try {
    if (!config.dev) {
      rmSync(config.pkgDir, { recursive: true, force: true });
    }
    try {
      // ensure the build pkgDir exists
      mkdirSync(config.pkgDir, { recursive: true });
    } catch (e) {}

    await Promise.all([
      submoduleCore(config),
      submoduleJsxRuntime(config),
      submoduleQwikLoader(config),
      submoduleServer(config),
      submoduleTesting(config),
      generatePackageJson(config),
      copyFiles(config),
      buildDevServer(config),
    ]);

    await submoduleOptimizer(config);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
