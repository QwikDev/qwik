import { BuildConfig, copyFile, emptyDir, importPath, mkdir, stat } from './util';
import { build } from 'esbuild';
import { basename, join } from 'path';
import { getBanner, readdir, watcher } from './util';
import { readPackageJson, writePackageJson } from './package-json';
import semver from 'semver';

export async function buildCli(config: BuildConfig) {
  const distCliDir = join(config.distDir, 'create-qwik');

  await bundleCli(config, distCliDir);

  const distStartersDir = join(distCliDir, 'starters');
  await mkdir(distStartersDir);

  const copyDirs = ['apps', 'servers', 'features'];
  await Promise.all(
    copyDirs.map(async (dirName) => {
      const srcDir = join(config.startersDir, dirName);
      const distDir = join(distStartersDir, dirName);
      await copyDir(config, srcDir, distDir);
    })
  );

  const srcCliDir = join(config.srcDir, 'cli');
  await copyFile(join(srcCliDir, 'package.json'), join(distCliDir, 'package.json'));
  await copyFile(join(srcCliDir, 'README.md'), join(distCliDir, 'README.md'));

  console.log('🐠 create-qwik cli');
}

async function bundleCli(config: BuildConfig, distCliDir: string) {
  emptyDir(distCliDir);

  await build({
    entryPoints: [join(config.srcDir, 'cli', 'interface', 'index.ts')],
    outfile: join(distCliDir, 'create-qwik'),
    bundle: true,
    sourcemap: false,
    target: 'node10',
    platform: 'node',
    minify: !config.dev,
    plugins: [importPath(/api$/, './index.js')],
    banner: {
      js: `#! /usr/bin/env node\n${getBanner('create-qwik')}`,
    },
    watch: watcher(config),
  });

  await build({
    entryPoints: [join(config.srcDir, 'cli', 'api', 'index.ts')],
    outfile: join(distCliDir, 'index.js'),
    bundle: true,
    sourcemap: false,
    target: 'node10',
    platform: 'node',
    minify: !config.dev,
    banner: {
      js: getBanner('create-qwik'),
    },
    watch: watcher(config),
  });
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
  if (pkgJson.devDependencies) {
    const rootPkg = await readPackageJson(config.rootDir);

    const setVersionFromRoot = (pkgName: string) => {
      if (pkgJson.devDependencies && pkgJson.devDependencies[pkgName]) {
        if (
          rootPkg.devDependencies &&
          rootPkg.devDependencies[pkgName] &&
          !semver.prerelease(rootPkg.devDependencies[pkgName])
        ) {
          pkgJson.devDependencies[pkgName] = rootPkg.devDependencies[pkgName];
        }
      }
    };

    if (pkgJson.devDependencies['@builder.io/qwik'] && !semver.prerelease(rootPkg.version)) {
      pkgJson.devDependencies['@builder.io/qwik'] = rootPkg.version;
    }

    setVersionFromRoot('@types/node');
    setVersionFromRoot('prettier');
    setVersionFromRoot('typescript');
    setVersionFromRoot('vite');

    await writePackageJson(destDir, pkgJson);
  }
}

const IGNORE: { [path: string]: boolean } = {
  '.rollup.cache': true,
  build: true,
  server: true,
  e2e: true,
  node_modules: true,
  'package-lock.json': true,
  'starter.tsconfig.json': true,
  'tsconfig.tsbuildinfo': true,
  'yarn.lock': true,
};

export async function validateCreateQwikCli(config: BuildConfig, errors: string[]) {
  try {
  } catch (e: any) {
    errors.push(String(e.message || e));
  }
}
