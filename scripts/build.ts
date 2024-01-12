import { type BuildConfig, ensureDir, panic } from './util';
import { apiExtractor } from './api';
import { buildCreateQwikCli } from './create-qwik-cli';
import { buildEslint } from './eslint';
import { buildPlatformBinding, copyPlatformBindingWasm } from './binding-platform';
import { buildQwikCity } from './qwik-city';
import { buildQwikReact } from './qwik-react';
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
import { submoduleBuild } from './submodule-build';
import { submoduleCli } from './submodule-cli';
import { submoduleCore } from './submodule-core';
import { submoduleJsxRuntime } from './submodule-jsx-runtime';
import { submoduleOptimizer } from './submodule-optimizer';
import { submoduleQwikLoader } from './submodule-qwikloader';
import { submoduleQwikPrefetch } from './submodule-qwikprefetch';
import { submoduleServer } from './submodule-server';
import { submoduleTesting } from './submodule-testing';
import { tsc } from './tsc';
import { tscDocs } from './tsc-docs';
import { validateBuild } from './validate-build';
import { buildQwikAuth } from './qwik-auth';
import { buildSupabaseAuthHelpers } from './supabase-auth-helpers';
import { buildQwikWorker } from './qwik-worker';
import { buildQwikLabs } from './qwik-labs';
import { watch, copyFile } from 'fs/promises';
import { join } from 'path';

/**
 * Complete a full build for all of the package's submodules. Passed in config has all the correct
 * absolute paths to read from and write to. Additionally, a dev build does not empty the directory,
 * and uses esbuild for each of the submodules for speed. A production build will use TSC + Rollup +
 * Terser for the core submodule.
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
        ensureDir(config.distQwikPkgDir);
      } else {
        emptyDir(config.distQwikPkgDir);
      }

      // create the dist package.json first so we get the version set
      await generatePackageJson(config);

      await Promise.all([
        submoduleCore(config),
        submoduleJsxRuntime(config),
        submoduleQwikLoader(config),
        submoduleQwikPrefetch(config),
        submoduleBuild(config),
        submoduleTesting(config),
        submoduleCli(config),
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

    if (config.qwikauth) {
      await buildQwikAuth(config);
    }

    if (config.qwikworker) {
      await buildQwikWorker(config);
    }

    if (config.api) {
      await apiExtractor(config);
    }

    if (config.qwiklabs) {
      await buildQwikLabs(config);
    }

    if (config.supabaseauthhelpers) {
      await buildSupabaseAuthHelpers(config);
    }

    if (config.tscDocs) {
      await tscDocs(config);
    }

    if (config.validate) {
      await validateBuild(config);
    }

    if (config.cli) {
      await buildCreateQwikCli(config);
      await submoduleCli(config);
    }

    if (config.prepareRelease) {
      // locally commit the package.json change
      await commitPrepareReleaseVersion(config);
    } else if (config.release) {
      // release from ci
      await publish(config);
    }

    if (config.watch) {
      await watchDirectories({
        [join(config.srcQwikDir, 'core')]: async () => {
          await submoduleCore({ ...config, dev: true });
          await copyFile(
            join(config.srcQwikDir, '..', 'dist', 'core.cjs'),
            join(config.srcQwikDir, '..', 'dist', 'core.prod.cjs')
          );
          await copyFile(
            join(config.srcQwikDir, '..', 'dist', 'core.mjs'),
            join(config.srcQwikDir, '..', 'dist', 'core.prod.mjs')
          );
          console.log(
            join(config.srcQwikDir, '..', 'dist', 'core.cjs'),
            join(config.srcQwikDir, '..', 'dist', 'core.prod.cjs')
          );
        },
        [join(config.srcQwikDir, 'optimizer')]: () => submoduleOptimizer(config),
        [join(config.srcQwikDir, 'prefetch-service-worker')]: () => submoduleQwikPrefetch(config),
        [join(config.srcQwikDir, 'server')]: () => submoduleServer(config),
        [join(config.srcQwikCityDir, 'runtime/src')]: () => buildQwikCity(config),
      });
    }
  } catch (e: any) {
    panic(String(e ? e.stack || e : 'Error'));
  }
}

async function watchDirectories(dirs: Record<string, () => Promise<any>>) {
  const promises: Promise<void>[] = [];
  for (const dir of Object.keys(dirs)) {
    promises.push(watchDirectory(dir, dirs[dir]));
  }
  return Promise.all(promises);
}
async function watchDirectory(dir: string, reactionFn: () => Promise<void>) {
  console.log('👀 watching', dir);
  for await (const change of watch(dir, { recursive: true })) {
    console.log('👀 change in', dir, '=>', change.filename);
    try {
      await reactionFn();
    } catch (e) {
      console.error('👀 error', dir, '=>', e);
    }
  }
}
