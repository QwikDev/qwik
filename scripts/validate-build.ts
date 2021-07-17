import { extname, join } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';
import { BuildConfig, loadConfig, PackageJSON } from './util';
import ts from 'typescript';
import { access, readFile } from 'fs/promises';

/**
 * This will validate a completed production build by triple checking all the
 * files have been created and can execute correctly in their context. This is
 * the last task before publishing the build files to npm.
 */
export async function validateBuild() {
  const config = loadConfig(process.argv.slice(2));
  const pkgPath = join(config.pkgDir, 'package.json');
  const pkg: PackageJSON = JSON.parse(await readFile(pkgPath, 'utf-8'));

  // triple checks these all exist and work
  const expectedFiles = pkg.files.map((f) => join(config.pkgDir, f));

  for (const filePath of expectedFiles) {
    try {
      // loop through each file and ensure it's built correct
      const ext = extname(filePath);

      switch (ext) {
        case '.cjs':
          require(filePath);
          break;
        case '.mjs':
          await import(filePath);
          break;
        case '.ts':
          validateTypeScriptFile(filePath);
          break;
        case '.json':
          JSON.parse(readFileSync(filePath, 'utf-8'));
          break;
        case '.map':
          JSON.parse(readFileSync(filePath, 'utf-8'));
          break;
        default:
          const content = readFileSync(filePath, 'utf-8');
          if (content.trim() === '') {
            throw new Error('empty file');
          }
      }
    } catch (e) {
      console.error('Validate Build File Error!');
      console.error(filePath);
      console.error(e);
      process.exit(1);
    }
  }

  await validatePackageJson(config, pkg);

  const allFiles: string[] = [];
  function getFiles(dir: string) {
    readdirSync(dir)
      .map((f) => join(dir, f))
      .forEach((filePath) => {
        const s = statSync(filePath);
        if (s.isDirectory()) {
          getFiles(filePath);
        } else if (s.isFile()) {
          allFiles.push(filePath);
        } else {
          throw new Error(`unexpected ${filePath}`);
        }
      });
  }
  getFiles(config.pkgDir);
  const unexpectedFiles = allFiles.filter((f) => !expectedFiles.includes(f));

  if (unexpectedFiles.length > 0) {
    console.error(
      `Unexpected files found in the package build:\n${unexpectedFiles.join(
        '\n'
      )}\n\nIf this is on purpose, add the file(s) to the expect files list in ${__filename}`
    );
    process.exit(1);
  }

  console.log('🏆', 'validated build');
}

/**
 * Do a full typescript build for each separate .d.ts file found in the package
 * just to ensure it's well formed and relative import paths are correct.
 */
function validateTypeScriptFile(tsFile: string) {
  const program = ts.createProgram([tsFile], {});

  const tsDiagnostics = program.getSemanticDiagnostics().concat(program.getSyntacticDiagnostics());

  if (tsDiagnostics.length > 0) {
    const host = {
      getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
      getNewLine: () => ts.sys.newLine,
      getCanonicalFileName: (f: string) => f,
    };
    throw new Error('🧨  ' + ts.formatDiagnostics(tsDiagnostics, host));
  }
}

/**
 * The package.json should already have the "files" property, stating
 * all of the exact files that should be package should contain.
 * Let's loop through it and triple check this build has those files.
 */
async function validatePackageJson(config: BuildConfig, pkg: PackageJSON) {
  await Promise.all([
    validatePath(config, pkg.main),
    validatePath(config, pkg.module),
    validatePath(config, pkg.types),
  ]);

  const exportKeys = Object.keys(pkg.exports);

  await Promise.all(
    exportKeys.map(async (exportKey) => {
      const val = pkg.exports[exportKey];
      if (typeof val === 'string') {
        await validatePath(config, val);
      } else {
        await validatePath(config, val.import);
        await validatePath(config, val.require);
      }
    })
  );
}

async function validatePath(config: BuildConfig, path: string) {
  try {
    await access(join(config.pkgDir, path));
  } catch (e) {
    console.error(
      `Error validating path "${path}" inside of "${join(config.pkgDir, 'package.json')}"`
    );
    console.error(e);
    process.exit(1);
  }
}

validateBuild();
