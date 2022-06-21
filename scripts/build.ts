import { BuildConfig, ensureDir, panic } from './util';
import { apiExtractor } from './api';
import { buildPlatformBinding, copyPlatformBindingWasm } from './binding-platform';
import { buildWasmBinding } from './binding-wasm';
import { copyFiles } from './copy-files';
import { emptyDir } from './util';
import { generatePackageJson } from './package-json';
import {
  commitPrepareReleaseVersion,
  prepareReleaseVersion,
  publish,
  setDevVersion,
  setReleaseVersion,
} from './release';
import { submoduleCore } from './submodule-core';
import { submoduleJsxRuntime } from './submodule-jsx-runtime';
import { submoduleOptimizer } from './submodule-optimizer';
import { submoduleQwikLoader } from './submodule-qwikloader';
import { submoduleServer } from './submodule-server';
import { submoduleTesting } from './submodule-testing';
import { tsc } from './tsc';
import { validateBuild } from './validate-build';
import { buildCli } from './cli';
import { submoduleBuild } from './submodule-build';
import { buildEslint } from './eslint';
import { buildQwikCity } from './qwik-city';
import { buildQwikReact } from './qwik-react';

/**
 * Complete a full build for all of the package's submodules. Passed in
 * config has all the correct absolute paths to read from and write to.
 * Additionally, a dev build does not empty the directory, and uses
 * esbuild for each of the submodules for speed. A production build will
 * use TSC + Rollup + Terser for the core submodule.
 */
export async function build(config: BuildConfig) {
  config.devRelease = config.devRelease || (!!config.release && config.setDistTag === 'dev');
  try {
    if (config.prepareRelease) {
      // locally set the version for the upcoming release
      await prepareReleaseVersion(config);
    } else if (config.release && !config.dryRun && !config.devRelease) {
      // ci release, npm publish
      await setReleaseVersion(config);
    } else {
      // local build or ci commit that's not for publishing
      await setDevVersion(config);
    }

    console.log(
      `🌎 Qwik v${config.distVersion}`,
      `[node ${process.version}, ${process.platform}/${process.arch}]`
    );

    if (config.tsc) {
      await tsc(config);
    }

    if (config.build) {
      if (config.dev) {
        ensureDir(config.distPkgDir);
      } else {
        emptyDir(config.distPkgDir);
      }

      // create the dist package.json first so we get the version set
      await generatePackageJson(config);

      await Promise.all([
        submoduleCore(config),
        submoduleJsxRuntime(config),
        submoduleQwikLoader(config),
        submoduleBuild(config),
        submoduleTesting(config),
        copyFiles(config),
      ]);

      // server bundling must happen after the results from the others
      // because it inlines the qwik loader and prefetch scripts
      await Promise.all([submoduleServer(config), submoduleOptimizer(config)]);
    }

    if (config.eslint) {
      await buildEslint(config);
    }

    if (config.platformBinding) {
      await buildPlatformBinding(config);
    } else if (config.platformBindingWasmCopy) {
      await copyPlatformBindingWasm(config);
    }

    if (config.wasm) {
      await buildWasmBinding(config);
    }

    if (config.qwikcity) {
      await buildQwikCity(config);
    }

    if (config.qwikreact) {
      await buildQwikReact(config);
    }

    if (config.api) {
      apiExtractor(config);
    }

    if (config.validate) {
      await validateBuild(config);
    }

    if (config.cli) {
      await buildCli(config);
    }

    if (config.prepareRelease) {
      // locally commit the package.json change
      await commitPrepareReleaseVersion(config);
    } else if (config.release) {
      // release from ci
      await publish(config);
    }

    if (config.watch) {
      console.log('👀 watching...');
    }
  } catch (e: any) {
    panic(String(e.stack || e));
  }
}
