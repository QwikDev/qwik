import { build } from 'esbuild';
import RawPlugin from 'esbuild-plugin-raw';
import { execa } from 'execa';
import { join } from 'node:path';
import { writePackageJson } from './package-json';
import { type BuildConfig, nodeTarget, type PackageJSON, panic } from './util';

export async function submoduleInsights(config: BuildConfig) {
  await buildComponents(config);
  await buildVite(config);

  console.log(`📈 insights`);
}

async function buildComponents(config: BuildConfig) {
  const execOptions = {
    win: {
      manager: 'npm',
      command: ['run', 'build.insights'],
    },
    other: {
      manager: 'pnpm',
      command: ['build.insights'],
    },
  };
  const isWindows = process.platform.includes('win32');
  const runOptions = isWindows ? execOptions.win : execOptions.other;

  const result = await execa(runOptions.manager, runOptions.command, {
    stdout: 'inherit',
    cwd: config.srcQwikDir,
  });
  if (result.failed) {
    panic(`tsc failed`);
  }

  // Create package.json

  const distBase = join(config.distQwikPkgDir, 'insights');

  const insightsPkg: PackageJSON = {
    name: `@qwik.dev/core/insights`,
    version: config.distVersion,
    main: `index.mjs`,
    types: `index.d.ts`,
    private: true,
    type: 'module',
  };
  await writePackageJson(distBase, insightsPkg);
}

const external = ['fs', 'path', 'vite', 'typescript', '@qwik.dev/core/optimizer'];

async function buildVite(config: BuildConfig) {
  const entryPoints = [join(config.srcQwikDir, 'insights', 'vite', 'index.ts')];

  const distBase = join(config.distQwikPkgDir, 'insights', 'vite');

  await build({
    entryPoints,
    outfile: join(distBase, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'esm',
    external,
    plugins: [RawPlugin()],
  });

  await build({
    entryPoints,
    outfile: join(distBase, 'index.cjs'),
    bundle: true,
    platform: 'node',
    target: nodeTarget,
    format: 'cjs',
    external,
    plugins: [RawPlugin()],
  });

  // Create package.json

  const insightsVitePkg: PackageJSON = {
    name: `@qwik.dev/core/insights/vite`,
    version: config.distVersion,
    main: `index.mjs`,
    types: `index.d.ts`,
    private: true,
    type: 'module',
  };
  await writePackageJson(distBase, insightsVitePkg);
}
