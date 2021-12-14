import { BuildConfig, copyFile, emptyDir, mkdir, PackageJSON, readFile, stat } from './util';
import { banner, fileSize, readdir, unlink, watcher } from './util';
import { build } from 'esbuild';
import { basename, join } from 'path';
import { readPackageJson, writePackageJson } from './package-json';
import semver from 'semver';

export async function buildCli(config: BuildConfig) {
  const distCliDir = join(config.distDir, 'create-qwik');
  const outFile = join(distCliDir, 'index.js');
  emptyDir(distCliDir);

  await build({
    entryPoints: [join(config.srcDir, 'cli', 'index.ts')],
    outfile: outFile,
    bundle: true,
    sourcemap: false,
    target: 'node10',
    platform: 'node',
    minify: !config.dev,
    banner: {
      js: `#! /usr/bin/env node\n${banner.js}`,
    },
    watch: watcher(config),
  });

  const distStartersDir = join(distCliDir, 'starters');
  await copyDir(config, config.startersDir, distStartersDir);
  await unlink(join(distStartersDir, '.gitignore'));
  await unlink(join(distStartersDir, 'README.md'));

  const srcCliDir = join(config.srcDir, 'cli');
  await copyFile(join(srcCliDir, 'package.json'), join(distCliDir, 'package.json'));
  await copyFile(join(srcCliDir, 'README.md'), join(distCliDir, 'README.md'));

  console.log('🐠 create-qwik cli', await fileSize(outFile));
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
  node_modules: true,
  'package-lock.json': true,
  'tsconfig.tsbuildinfo': true,
  'yarn.lock': true,
};
