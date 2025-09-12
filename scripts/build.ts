import { rmSync } from 'fs';
import { copyFile, watch } from 'fs/promises';
import { join } from 'path';
import { apiExtractorQwik, apiExtractorQwikRouter } from './api';
import { buildPlatformBinding, copyPlatformBindingWasm } from './binding-platform';
import { buildWasmBinding } from './binding-wasm';
import { buildCreateQwikCli } from './create-qwik-cli';
import { buildEslint } from './eslint';
import { buildQwikReact } from './qwik-react';
import { buildQwikRouter } from './qwik-router';
import {
  commitPrepareReleaseVersion,
  prepareReleaseVersion,
  publish,
  setDistVersion,
  setReleaseVersion,
} from './release';
import { submoduleBuild } from './submodule-build';
import { submoduleCli } from './submodule-cli';
import { submoduleCore } from './submodule-core';
import { submoduleInsights } from './submodule-insights';
import { submoduleOptimizer } from './submodule-optimizer';
import { submoduleQwikLoader } from './submodule-qwikloader';
import { submoduleBackpatch } from './submodule-backpatch';
import { submoduleServer } from './submodule-server';
import { submoduleTesting } from './submodule-testing';
import { buildSupabaseAuthHelpers } from './supabase-auth-helpers';
import { tsc, tscQwik, tscQwikRouter } from './tsc';
import { tscDocs } from './tsc-docs';
import { emptyDir, ensureDir, panic, type BuildConfig } from './util';
import { validateBuild } from './validate-build';
import { submodulePreloader } from './submodule-preloader';

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
      // local build or dev build
      await setDistVersion(config);
    }

    console.log(
      `🌎 Qwik v${config.distVersion}`,
      `[node ${process.version}, ${process.platform}/${process.arch}]`
    );

    if (config.tsc || (!config.dev && config.qwik)) {
      rmSync(config.tscDir, { recursive: true, force: true });
      rmSync(config.dtsDir, { recursive: true, force: true });
      await tscQwik(config);
    }

    if (config.qwik) {
      if (config.dev) {
        ensureDir(config.distQwikPkgDir);
      } else {
        emptyDir(config.distQwikPkgDir);
      }
      await submodulePreloader(config);
      await Promise.all([
        submoduleCore(config),
        submoduleQwikLoader(config),
        submoduleBackpatch(config),
        submoduleBuild(config),
        submoduleTesting(config),
        submoduleCli(config),
      ]);
    }
    if (config.insights) {
      await submoduleInsights(config);
    }
    if (config.qwik) {
      // server bundling must happen after the results from the others
      // because it inlines the qwik loader
      await Promise.all([submoduleServer(config), submoduleOptimizer(config)]);
    }

    if (config.api || (!config.dev && config.qwik)) {
      rmSync(join(config.rootDir, 'dist-dev', 'api'), { recursive: true, force: true });
      rmSync(join(config.rootDir, 'dist-dev', 'api-docs'), { recursive: true, force: true });
      rmSync(join(config.rootDir, 'dist-dev', 'api-extractor'), { recursive: true, force: true });
    }
    if (config.api || ((!config.dev || config.tsc) && config.qwik)) {
      await apiExtractorQwik(config);
    }

    if (config.platformBinding) {
      await buildPlatformBinding(config);
    } else if (config.platformBindingWasmCopy) {
      await copyPlatformBindingWasm(config);
    }

    if (config.wasm) {
      await buildWasmBinding(config);
    }

    if (config.tsc || (!config.dev && config.qwikrouter)) {
      await tscQwikRouter(config);
    }

    if (config.qwikrouter) {
      await buildQwikRouter(config);
    }

    if (config.api || ((!config.dev || config.tsc) && config.qwikrouter)) {
      await apiExtractorQwikRouter(config);
    }

    if (config.tsc) {
      await tsc(config);
    }

    if (config.eslint) {
      await buildEslint(config);
    }

    if (config.qwikreact) {
      await buildQwikReact(config);
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
        [join(config.srcQwikDir, 'cli')]: () => submoduleCli(config),
        [join(config.srcQwikDir, 'optimizer')]: () => submoduleOptimizer(config),
        [join(config.srcQwikDir, 'server')]: () => submoduleServer(config),
        [join(config.srcQwikRouterDir, 'runtime/src')]: () => buildQwikRouter(config),
      });
    }
  } catch (e: any) {
    panic(e);
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
