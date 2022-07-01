import { BuildConfig, copyFile, emptyDir, importPath, mkdir, nodeTarget, stat } from './util';
import { build } from 'esbuild';
import { basename, join } from 'path';
import { getBanner, readdir, watcher, run } from './util';
import { readPackageJson, writePackageJson } from './package-json';

const PACKAGE = 'create-qwik';

export async function buildCli(config: BuildConfig) {
  const srcCliDir = join(config.packagesDir, PACKAGE);
  const distCliDir = join(srcCliDir, 'dist');

  await bundleCli(config, srcCliDir, distCliDir);

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

  await copyFile(join(srcCliDir, 'package.json'), join(distCliDir, 'package.json'));
  await copyFile(join(srcCliDir, 'README.md'), join(distCliDir, 'README.md'));

  console.log('🐠 create-qwik cli');
}

async function bundleCli(config: BuildConfig, srcCliDir: string, distCliDir: string) {
  emptyDir(distCliDir);

  await build({
    entryPoints: [join(srcCliDir, 'interface', 'index.ts')],
    outfile: join(distCliDir, PACKAGE),
    bundle: true,
    sourcemap: false,
    target: nodeTarget,
    platform: 'node',
    minify: !config.dev,
    plugins: [importPath(/api$/, './index.js')],
    banner: {
      js: `${getBanner(PACKAGE)}`,
    },
    watch: watcher(config),
  });

  await build({
    entryPoints: [join(srcCliDir, 'api', 'index.ts')],
    outfile: join(distCliDir, 'index.js'),
    bundle: true,
    sourcemap: false,
    target: 'node14',
    platform: 'node',
    minify: !config.dev,
    banner: {
      js: getBanner(PACKAGE),
    },
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
  baseAppPkg.devDependencies['eslint-plugin-qwik'] = version;

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
