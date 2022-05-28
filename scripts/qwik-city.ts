import { BuildConfig, copyFile, emptyDir, importPath, mkdir, stat, watcher } from './util';
import { build } from 'esbuild';
import { basename, join } from 'path';
import { readdir, run } from './util';
import { readPackageJson, writePackageJson } from './package-json';

const PACKAGE = 'qwik-city';

export async function buildQwikCity(config: BuildConfig) {
  const input = join(config.packagesDir, PACKAGE);
  const output = join(input, 'dist');

  await buildRuntime(input, output, config);
  await buildVite(input, output, config);

  console.log(`🏙 ${PACKAGE}`);
}

async function buildRuntime(input: string, output: string, config: BuildConfig) {
  const external = ['@builder.io/qwik', '@builder.io/qwik-city/build'];
  const entryPoints = [join(input, 'src', 'runtime', 'index.ts')];
  await build({
    entryPoints,
    outfile: join(output, 'index.mjs'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    external,
    watch: watcher(config),
  });

  await build({
    entryPoints,
    outfile: join(output, 'index.cjs'),
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    external,
    watch: watcher(config),
  });
}

async function buildVite(input: string, output: string, config: BuildConfig) {
  const entryPoints = [join(input, 'src', 'vite', 'index.ts')];

  const external = ['source-map', 'vfile', '@mdx-js/mdx'];

  await build({
    entryPoints,
    outfile: join(output, 'vite', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    external,
    watch: watcher(config),
  });

  await build({
    entryPoints,
    outfile: join(output, 'vite', 'index.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external,
    watch: watcher(config),
  });
}

export async function publishStarterCli(
  config: BuildConfig,
  distTag: string,
  version: string,
  isDryRun: boolean
) {
  const distCliDir = join(config.packagesDir, PACKAGE, 'dist');
  const cliPkg = await readPackageJson(distCliDir);

  // update the cli version
  console.log(`   update version = "${version}"`);
  cliPkg.version = version;
  await writePackageJson(distCliDir, cliPkg);

  // update the base app's package.json
  const distCliBaseAppDir = join(distCliDir, 'starters', 'apps', 'base');
  const baseAppPkg = await readPackageJson(distCliBaseAppDir);
  baseAppPkg.devDependencies = baseAppPkg.devDependencies || {};

  console.log(`   update devDependencies["@builder.io/qwik"] = "${version}"`);
  baseAppPkg.devDependencies['@builder.io/qwik'] = version;

  const rootPkg = await readPackageJson(config.rootDir);
  const typescriptDepVersion = rootPkg.devDependencies!.typescript;
  const viteDepVersion = rootPkg.devDependencies!.vite;

  console.log(`   update devDependencies["typescript"] = "${typescriptDepVersion}"`);
  baseAppPkg.devDependencies['typescript'] = typescriptDepVersion;

  console.log(`   update devDependencies["vite"] = "${viteDepVersion}"`);
  baseAppPkg.devDependencies['vite'] = viteDepVersion;

  console.log(distCliBaseAppDir, JSON.stringify(baseAppPkg, null, 2));
  await writePackageJson(distCliBaseAppDir, baseAppPkg);

  console.log(`⛴ publishing ${cliPkg.name} ${version}`, isDryRun ? '(dry-run)' : '');

  const npmPublishArgs = ['publish', '--tag', distTag];

  await run('npm', npmPublishArgs, isDryRun, isDryRun, { cwd: distCliDir });

  console.log(
    `🐳 published version "${version}" of ${cliPkg.name} with dist-tag "${distTag}" to npm`,
    isDryRun ? '(dry-run)' : ''
  );
}

async function copyDir(config: BuildConfig, srcDir: string, destDir: string) {
  await mkdir(destDir);
  const items = await readdir(srcDir);
  await Promise.all(
    items.map(async (itemName) => {
      if (!IGNORE[itemName] && !itemName.includes('.test')) {
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
  const rootPkg = await readPackageJson(config.rootDir);
  const pkgJson = await readPackageJson(destDir);

  const setVersionFromRoot = (pkgName: string) => {
    if (pkgJson.devDependencies && pkgJson.devDependencies[pkgName]) {
      if (rootPkg.devDependencies && rootPkg.devDependencies[pkgName]) {
        pkgJson.devDependencies[pkgName] = rootPkg.devDependencies[pkgName];
      }
    }
  };

  if (pkgJson.devDependencies && pkgJson.devDependencies['@builder.io/qwik']) {
    pkgJson.devDependencies['@builder.io/qwik'] = rootPkg.version;
  }

  setVersionFromRoot('@types/eslint');
  setVersionFromRoot('@types/node');
  setVersionFromRoot('@typescript-eslint/eslint-plugin');
  setVersionFromRoot('@typescript-eslint/parser');
  setVersionFromRoot('eslint');
  setVersionFromRoot('prettier');
  setVersionFromRoot('typescript');
  setVersionFromRoot('vite');

  await writePackageJson(destDir, pkgJson);
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
