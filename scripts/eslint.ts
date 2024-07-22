import { type BuildConfig, run, nodeTarget } from './util';
import { join } from 'node:path';
import { build } from 'esbuild';
import { readPackageJson, writePackageJson } from './package-json';

const PACKAGE = 'eslint-plugin-qwik';

export async function buildEslint(config: BuildConfig) {
  const eslintDir = join(config.packagesDir, PACKAGE);
  const eslintOutput = join(eslintDir, 'dist');

  await build({
    entryPoints: [join(eslintDir, 'index.ts')],
    outfile: join(eslintOutput, 'index.js'),
    bundle: true,
    sourcemap: false,
    target: nodeTarget,
    platform: 'node',
    minify: !config.dev,
    external: ['eslint', 'espree', '@typescript-eslint/utils', 'typescript'],
  });

  console.log(`📐 ${PACKAGE}`);
}

export async function publishEslint(
  config: BuildConfig,
  distTag: string,
  version: string,
  isDryRun: boolean
) {
  const distDir = join(config.packagesDir, PACKAGE);
  const cliPkg = await readPackageJson(distDir);

  // update the cli version
  console.log(`   update version = "${version}"`);
  cliPkg.version = version;
  cliPkg.main = 'index.js';
  await writePackageJson(distDir, cliPkg);

  console.log(`⛴ publishing ${cliPkg.name} ${version}`, isDryRun ? '(dry-run)' : '');

  const npmPublishArgs = ['publish', '--tag', distTag];
  await run('npm', npmPublishArgs, isDryRun, isDryRun, { cwd: distDir });

  console.log(
    `🐳 published version "${version}" of ${cliPkg.name} with dist-tag "${distTag}" to npm`,
    isDryRun ? '(dry-run)' : ''
  );
}

export async function validateEslint(config: BuildConfig, errors: string[]) {
  try {
  } catch (e: any) {
    errors.push(String(e.message || e));
  }
}
