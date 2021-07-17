import { extname, join } from 'path';
import { accessSync, readFileSync, readdirSync, statSync } from 'fs';
import { validatePackageJson } from './package-json';
import { loadConfig } from './util';
import ts from 'typescript';

export async function validateBuild() {
  const config = loadConfig(process.argv.slice(2));

  // triple checks these all exist and work
  const expectedFiles = [
    'core.cjs',
    'core.cjs.map',
    'core.min.mjs',
    'core.mjs',
    'core.mjs.map',
    'core.d.ts',
    'jsx-runtime.cjs',
    'jsx-runtime.mjs',
    'jsx-runtime.d.ts',
    'LICENSE',
    'optimizer.cjs',
    'optimizer.cjs.map',
    'optimizer.mjs',
    'optimizer.mjs.map',
    'optimizer.d.ts',
    'package.json',
    'qwikloader.js',
    'qwikloader.debug.js',
    'qwikloader.optimize.js',
    'qwikloader.optimize.debug.js',
    'README.md',
    'server/index.cjs',
    'server/index.cjs.map',
    'server/index.mjs',
    'server/index.mjs.map',
    'server/index.d.ts',
    'testing/index.cjs',
    'testing/index.cjs.map',
    'testing/index.mjs',
    'testing/index.mjs.map',
    'testing/index.d.ts',
    'testing/jest-preprocessor.cjs',
    'testing/jest-preprocessor.cjs.map',
    'testing/jest-preprocessor.mjs',
    'testing/jest-preprocessor.mjs.map',
    'testing/jest-preset.cjs',
    'testing/jest-preset.cjs.map',
    'testing/jest-preset.mjs',
    'testing/jest-preset.mjs.map',
    'testing/jest-setuptestframework.cjs',
    'testing/jest-setuptestframework.cjs.map',
    'testing/jest-setuptestframework.mjs',
    'testing/jest-setuptestframework.mjs.map',
  ].map((f) => join(config.pkgDir, f));

  for (const filePath of expectedFiles) {
    try {
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

  await validatePackageJson(config);

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

validateBuild();
