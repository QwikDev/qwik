import type { BuildConfig } from './util';
import { apiExtractor } from './api';
import { buildDevServer } from './devserver';
import { buildPlatformBinding } from './platform-binding';
import { copyFiles } from './copy-files';
import { emptyDir } from './util';
import { generateJsxTypes } from './jsx-types';
import { generatePackageJson } from './package-json';
import { mkdirSync } from 'fs';
import { submoduleCore } from './submodule-core';
import { submoduleJsxRuntime } from './submodule-jsx-runtime';
import { submoduleOptimizer } from './submodule-optimizer';
import { submodulePrefetch } from './submodule-prefetch';
import { submoduleQwikLoader } from './submodule-qwikloader';
import { submoduleServer } from './submodule-server';
import { submoduleTesting } from './submodule-testing';
import { tsc } from './tsc';
import { validateBuild } from './validate-build';

/**
 * Complete a full build for all of the package's submodules. Passed in
 * config has all the correct absolute paths to read from and write to.
 * Additionally, a dev build does not empty the directory, and uses
 * esbuild for each of the submodules for speed. A production build will
 * use TSC + Rollup + Terser for the core submodule.
 */
export async function build(config: BuildConfig) {
  try {
    console.log(`🌎 building (nodejs ${process.version})`);

    if (config.tsc) {
      tsc(config);
    }

    if (config.build) {
      if (!config.dev) {
        emptyDir(config.distPkgDir);
      }
      try {
        // ensure the build pkgDir exists
        mkdirSync(config.distPkgDir, { recursive: true });
      } catch (e) {}

      await Promise.all([
        submoduleCore(config),
        submoduleJsxRuntime(config),
        submoduleQwikLoader(config),
        submodulePrefetch(config),
        submoduleTesting(config),
        generatePackageJson(config),
        copyFiles(config),
        buildDevServer(config),
      ]);
      await Promise.all([submoduleOptimizer(config), submoduleServer(config)]);
    }

    if (config.platformBinding) {
      await buildPlatformBinding(config);
    }

    if (config.api) {
      apiExtractor(config);
    }

    if (config.jsx) {
      await generateJsxTypes(config);
    }

    if (config.validate) {
      await validateBuild(config);
    }

    if (config.watch) {
      console.log('👀', 'watching...');
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
