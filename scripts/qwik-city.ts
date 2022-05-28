import { BuildConfig, watcher } from './util';
import { build } from 'esbuild';
import { join } from 'path';

const PACKAGE = 'qwik-city';

export async function buildQwikCity(config: BuildConfig) {
  const input = join(config.packagesDir, PACKAGE);
  const output = join(input, 'dist');

  await buildRuntime(input, output, config);
  await buildVite(input, output, config);

  console.log(`🏙  ${PACKAGE}`);
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
