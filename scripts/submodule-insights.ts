import { build } from 'esbuild';
import RawPlugin from 'esbuild-plugin-raw';
import { execa } from 'execa';
import { join } from 'node:path';
import { type BuildConfig, nodeTarget, panic } from './util';

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
}
