import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync } from 'node:zlib';
import { rollup } from 'rollup';
import ts from 'typescript';
import { access, type BuildConfig, type PackageJSON, panic, readFile } from './util.ts';

/**
 * This will validate a completed production build by triple checking all the files have been
 * created and can execute correctly in their context. This is the last task before publishing the
 * build files to npm.
 */
export async function validateBuild(config: BuildConfig) {
  console.log('🕵️ validating build...');
  const pkgPath = join(config.distQwikPkgDir, 'package.json');
  const pkg: PackageJSON = JSON.parse(await readFile(pkgPath, 'utf-8'));
  const errors: string[] = [];

  // triple checks these package files all exist and parse
  const pkgFiles = [...pkg.files!, 'LICENSE', 'README.md', 'package.json'];
  const expectedFiles = pkgFiles.map((f) => join(config.distQwikPkgDir, f));

  const dependencies = ['@qwik.dev/compiler', '@qwik.dev/optimizer', 'csstype', 'vite'];
  const pkgDependencies = Object.keys(pkg.dependencies!);
  if (pkgDependencies.length !== dependencies.length) {
    errors.push(
      `Expected ${dependencies.length} dependencies, but found ${pkgDependencies.length}.`
    );
  } else {
    for (const dep of dependencies) {
      if (!pkgDependencies.includes(dep)) {
        errors.push(`Expected ${dep} to be a dependency.`);
      }
    }
  }

  for (const filePath of expectedFiles) {
    try {
      // loop through each file and ensure it's built correct
      const ext = extname(filePath);

      switch (ext) {
        case '.mjs':
          if (config.esmNode) {
            await import(pathToFileURL(filePath).href);
            console.log(`✅ ${filePath}`);
            break;
          }
        case '.ts':
          validateTypeScriptFile(config, filePath);
          console.log(`✅ ${filePath}`);
          break;
        case '.json':
          JSON.parse(readFileSync(filePath, 'utf-8'));
          console.log(`✅ ${filePath}`);
          break;
        case '.map':
          JSON.parse(readFileSync(filePath, 'utf-8'));
          console.log(`✅ ${filePath}`);
          break;
        default:
          if (existsSync(filePath)) {
            const s = statSync(filePath);
            if (s.isFile()) {
              const content = readFileSync(filePath, 'utf-8');
              if (content.trim() === '') {
                errors.push(`Expected package.json file is empty: ${filePath}`);
              } else {
                console.log(`✅ ${filePath}`);
              }
            } else {
              console.log(`✅ ${filePath}`);
            }
          } else {
            if (process.env.CI || (!process.env.CI && ext !== '.node')) {
              errors.push(`Expected package.json file not found: ${filePath}`);
            } else {
              console.log(`✅ ${filePath}`);
            }
          }
      }
    } catch (e: any) {
      errors.push(`${filePath}: ${String(e.stack || e)}`);
    }
  }

  await validatePackageJson(config, pkg, errors);
  await Promise.all([
    validateModuleTreeshake(join(config.distQwikPkgDir, 'core.min.mjs')),
    validateModuleTreeshake(join(config.distQwikPkgDir, 'core.min.mjs'), [], 'useSignal', 800),
    validateModuleTreeshake(join(config.distQwikPkgDir, 'core.prod.mjs')),
    validateModuleTreeshake(join(config.distQwikPkgDir, 'core.mjs')),
    validateModuleTreeshake(join(config.distQwikPkgDir, 'server.mjs')),
  ]);
  if (config.qwikrouter) {
    await validateModuleTreeshake(
      join(config.packagesDir, 'qwik-router', 'lib', 'index.qwik.mjs'),
      ['@qwik-router-config', '@qwik-router-sw-register', 'zod', '@qwik.dev/core/jsx-runtime']
    );
  }

  const allFiles: string[] = [];
  function getFiles(dir: string) {
    readdirSync(dir)
      .map((f) => join(dir, f))
      .forEach((filePath) => {
        const s = statSync(filePath);
        if (s.isDirectory()) {
          const dirName = basename(filePath);
          if (dirName !== 'starters' && dirName !== 'templates') {
            getFiles(filePath);
          }
        } else if (s.isFile()) {
          allFiles.push(filePath);
        } else {
          errors.push(`Unexpected: ${filePath}`);
        }
      });
  }
  getFiles(config.distQwikPkgDir);
  const unexpectedFiles = allFiles.filter((f) => !expectedFiles.includes(f));

  if (unexpectedFiles.length > 0) {
    errors.push(
      `Unexpected files found in the package build:\n${unexpectedFiles.join(
        '\n'
      )}\n\nIf this file is expected, add the file(s) to the package.json "files" array`
    );
  }

  if (errors.length > 0) {
    errors.unshift(`Build did not pass validation.`);
    panic(errors.join('\n\n❌ '));
  } else {
    console.log('🏅 validated build');
  }
}

/**
 * Do a full typescript build for each separate .d.ts file found in the package just to ensure it's
 * well formed and relative import paths are correct.
 */
export function validateTypeScriptFile(config: BuildConfig, tsFilePath: string) {
  const tsconfigPath = join(config.rootDir, 'tsconfig.json');
  const tsconfigResults = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  const tsconfig = ts.parseJsonConfigFileContent(
    tsconfigResults.config,
    ts.sys,
    config.rootDir,
    undefined,
    tsconfigPath
  );
  const program = ts.createProgram([tsFilePath], tsconfig.options);

  const tsDiagnostics = [
    ...program.getSemanticDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getDeclarationDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getOptionsDiagnostics(),
  ];

  if (tsDiagnostics.length > 0) {
    const host = {
      getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
      getNewLine: () => ts.sys.newLine,
      getCanonicalFileName: (f: string) => f,
    };
    throw new Error(ts.formatDiagnostics(tsDiagnostics, host));
  }
}

async function validatePackageJson(config: BuildConfig, pkg: PackageJSON, errors: string[]) {
  async function validatePath(path: string) {
    try {
      await access(join(config.distQwikPkgDir, path));
    } catch (e: any) {
      errors.push(
        `Error loading file "${path}" referenced in package.json: ${String(
          e ? e.stack || e : 'Error'
        )}`
      );
    }
  }

  await Promise.all([validatePath(pkg.main), validatePath(pkg.types)]);

  async function validateExports(exports: Record<string, any>) {
    const exportKeys = Object.keys(exports);

    await Promise.all(
      exportKeys.map(async (exportKey) => {
        const val = exports[exportKey];
        if (typeof val === 'string') {
          await validatePath(val);
        } else {
          await validateExports(val);
        }
      })
    );
  }

  validateExports(pkg.exports!);
}

async function validateModuleTreeshake(
  entryModulePath: string,
  external: string[] = [],
  exportName?: string,
  maxBrotliSize?: number
): Promise<void> {
  const virtualInputId = `@index`;
  const bundle = await rollup({
    input: virtualInputId,
    treeshake: {
      moduleSideEffects: false,
    },
    external: ['@qwik.dev/core/build', '@qwik.dev/core', '@qwik.dev/core/preloader', ...external],
    plugins: [
      {
        name: 'resolver',
        resolveId(id) {
          if (id === virtualInputId) {
            return id;
          }
        },
        load(id) {
          if (id === virtualInputId) {
            return exportName
              ? `export { ${exportName} } from ${JSON.stringify(entryModulePath)};`
              : `import ${JSON.stringify(entryModulePath)};`;
          }
        },
      },
    ],
    onwarn(warning) {
      if (warning.code !== 'EMPTY_BUNDLE') {
        throw warning;
      }
    },
  });

  const o = await bundle.generate({
    format: 'es',
  });

  const output = o.output[0];
  const outputCode = output.code.trim();

  if (exportName) {
    const brotliSize = brotliCompressSync(outputCode).byteLength;
    if (maxBrotliSize !== undefined && brotliSize > maxBrotliSize) {
      throw new Error(
        `🧨  ${exportName} from ${entryModulePath} is ${brotliSize} B Brotli, expected at most ${maxBrotliSize} B`
      );
    }
    console.log(`🌳  ${exportName} from ${entryModulePath}: ${brotliSize} B Brotli`);
  } else if (outputCode !== '') {
    console.log(outputCode);
    throw new Error(`🧨  Unable to treeshake for ${entryModulePath}`);
  } else {
    console.log(`🌳  validated treeshake for ${entryModulePath}`);
  }
}
