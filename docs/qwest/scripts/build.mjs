import { build } from 'esbuild';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  try {
    await Promise.all([buildRuntime(), buildVite()]);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

async function buildRuntime() {
  const entryPoints = [resolve(__dirname, '..', 'src', 'runtime', 'index.ts')];

  const external = ['@builder.io/qwik', '@builder.io/qwest/build'];

  await build({
    entryPoints,
    outfile: 'dist/index.mjs',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    external,
  });

  await build({
    entryPoints,
    outfile: 'dist/index.cjs',
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    external,
  });
}

async function buildVite() {
  const entryPoints = [resolve(__dirname, '..', 'src', 'vite', 'index.ts')];

  const external = ['source-map', 'vfile', '@mdx-js/mdx'];

  await build({
    entryPoints,
    outfile: 'dist/vite/index.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
    external,
  });

  await build({
    entryPoints,
    outfile: 'dist/vite/index.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external,
  });
}

run();
