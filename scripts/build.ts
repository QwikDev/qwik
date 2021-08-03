import type { BuildConfig } from './util';
import { apiExtractor } from './api';
import { buildDevServer } from './devserver';
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
import { validateBuild } from './validate-build';
import ts from 'typescript';

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
        emptyDir(config.pkgDir);
      }
      try {
        // ensure the build pkgDir exists
        mkdirSync(config.pkgDir, { recursive: true });
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

function tsc(config: BuildConfig) {
  const tsconfigFile = ts.findConfigFile(config.rootDir, ts.sys.fileExists);
  const tsconfig = ts.getParsedCommandLineOfConfigFile(tsconfigFile!, undefined, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(String(d));
    },
  });
  if (tsconfig && Array.isArray(tsconfig.fileNames)) {
    const rootNames = tsconfig.fileNames;
    const program = ts.createProgram({
      rootNames,
      options: { ...tsconfig.options, outDir: config.tscDir },
    });
    const diagnostics = [
      ...program.getDeclarationDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getOptionsDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...program.getSyntacticDiagnostics(),
    ];
    if (diagnostics.length > 0) {
      const err = ts.formatDiagnostics(diagnostics, {
        ...ts.sys,
        getCanonicalFileName: (f) => f,
        getNewLine: () => '\n',
      });
      console.error(err);
      process.exit(1);
    }
    program.emit();
    console.log('🎲', 'tsc');
  } else {
    throw new Error(`invalid tsconfig`);
  }
}
