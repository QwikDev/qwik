import { BuildConfig, copyFile, mkdir, panic, stat } from './util';
import { readdir } from './util';
import { basename, join } from 'path';
import { readPackageJson, writePackageJson } from './package-json';
import semver from 'semver';
import ts from 'typescript';

export async function buildEslint(config: BuildConfig) {
  const eslintDir = join(config.rootDir, 'eslint-rules');
  const eslintOutput = join(config.distDir, 'eslint-plugin-qwik');

  const tsconfigFile = ts.findConfigFile(eslintDir, ts.sys.fileExists);
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
      options: { ...tsconfig.options, outDir: eslintOutput },
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
      panic(err);
    }
    program.emit();
    await copyFile(join(eslintDir, 'package.json'), join(eslintOutput, 'package.json'));
    await copyFile(join(eslintDir, 'README.md'), join(eslintOutput, 'README.md'));

    console.log('📐 eslint-qwik');
  } else {
    throw new Error(`invalid tsconfig`);
  }
}

async function copyDir(config: BuildConfig, srcDir: string, destDir: string) {
  await mkdir(destDir);
  const items = await readdir(srcDir);
  await Promise.all(
    items.map(async (itemName) => {
      if (!IGNORE[itemName]) {
        const srcPath = join(srcDir, itemName);
        const destPath = join(destDir, itemName);
        const itemStat = await stat(srcPath);
        if (itemStat.isDirectory()) {
          await copyDir(config, srcPath, destPath);
        } else if (itemStat.isFile()) {
          await copyFile(srcPath, destPath);
          if (basename(destPath) === 'package.json') {
            await updatePackageJson(config, destDir);
          }
        }
      }
    })
  );
}

async function updatePackageJson(config: BuildConfig, destDir: string) {
  const pkgJson = await readPackageJson(destDir);
  if (pkgJson.devDependencies && pkgJson.devDependencies['@builder.io/qwik']) {
    const rootPkg = await readPackageJson(config.rootDir);
    if (!semver.prerelease(rootPkg.version)) {
      pkgJson.devDependencies['@builder.io/qwik'] = `~${rootPkg.version}`;
      await writePackageJson(destDir, pkgJson);
    }
  }
}

const IGNORE: { [path: string]: boolean } = {
  '.rollup.cache': true,
  build: true,
  e2e: true,
  node_modules: true,
  'package-lock.json': true,
  'starter.tsconfig.json': true,
  'tsconfig.tsbuildinfo': true,
  'yarn.lock': true,
};

export async function validateEslint(config: BuildConfig, errors: string[]) {
  try {
  } catch (e: any) {
    errors.push(String(e.message || e));
  }
}
