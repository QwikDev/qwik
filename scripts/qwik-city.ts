import { BuildConfig, getBanner, rollupOnWarn, watcher } from './util';
import { build } from 'esbuild';
import { join } from 'path';
import { InputOptions, OutputOptions, rollup } from 'rollup';

const PACKAGE = 'qwik-city';

export async function buildQwikCity(config: BuildConfig) {
  const input = join(config.packagesDir, PACKAGE);
  const output = join(input, 'dist');

  await Promise.all([
    buildRuntime(config, output),
    buildAdaptor(config, output),
    buildVite(config, input, output),
    buildCloudflarePages(config, input, output),
    buildExpress(config, input, output),
  ]);

  console.log(`🏙  ${PACKAGE}`);
}

async function buildRuntime(config: BuildConfig, output: string) {
  const inputOpts: InputOptions = {
    input: join(config.tscDir, 'packages', 'qwik-city', 'src', 'runtime', 'index.js'),
    onwarn: rollupOnWarn,
    external: [
      '@builder.io/qwik',
      '@builder.io/qwik/build',
      '@builder.io/qwik/optimizer',
      '@builder.io/qwik/server',
      '@builder.io/qwik-dom',
    ],
  };

  const esmOutput: OutputOptions = {
    dir: output,
    format: 'es',
    entryFileNames: 'index.mjs',
    sourcemap: true,
    banner: getBanner('@builder.io/qwik-city'),
  };

  const cjsOutput: OutputOptions = {
    dir: output,
    format: 'cjs',
    entryFileNames: 'index.cjs',
    sourcemap: true,
    banner: getBanner('@builder.io/qwik-city'),
  };

  const build = await rollup(inputOpts);

  await Promise.all([build.write(esmOutput), build.write(cjsOutput)]);
}

async function buildVite(config: BuildConfig, input: string, output: string) {
  const entryPoints = [join(input, 'src', 'vite', 'index.ts')];

  const external = ['front-matter', 'source-map', 'vfile', '@mdx-js/mdx'];

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

async function buildAdaptor(config: BuildConfig, output: string) {
  const inputOpts: InputOptions = {
    input: join(config.tscDir, 'packages', 'qwik-city', 'src', 'adaptor', 'index.js'),
    onwarn: rollupOnWarn,
    external: [
      '@builder.io/qwik',
      '@builder.io/qwik/build',
      '@builder.io/qwik/optimizer',
      '@builder.io/qwik/server',
      '@builder.io/qwik-dom',
    ],
  };

  const esmOutput: OutputOptions = {
    dir: join(output, 'adaptor'),
    format: 'es',
    entryFileNames: 'index.mjs',
    sourcemap: true,
    banner: getBanner('@builder.io/qwik-city'),
  };

  const cjsOutput: OutputOptions = {
    dir: join(output, 'adaptor'),
    format: 'cjs',
    entryFileNames: 'index.cjs',
    sourcemap: true,
    banner: getBanner('@builder.io/qwik-city'),
  };

  const build = await rollup(inputOpts);

  await Promise.all([build.write(esmOutput), build.write(cjsOutput)]);
}

async function buildCloudflarePages(config: BuildConfig, input: string, output: string) {
  const entryPoints = [join(input, 'src', 'adaptor', 'adaptors', 'cloudflare-pages.ts')];

  const external = ['@builder.io/qwik-city/adaptor'];

  await build({
    entryPoints,
    outfile: join(output, 'cloudflare-pages', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    external,
    watch: watcher(config),
  });

  await build({
    entryPoints,
    outfile: join(output, 'cloudflare-pages', 'index.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external,
    watch: watcher(config),
  });
}

async function buildExpress(config: BuildConfig, input: string, output: string) {
  const entryPoints = [join(input, 'src', 'adaptor', 'adaptors', 'express.ts')];

  const external = ['express', 'path', '@builder.io/qwik-dom', '@builder.io/qwik-city/adaptor'];

  await build({
    entryPoints,
    outfile: join(output, 'express', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    external,
    watch: watcher(config),
  });

  await build({
    entryPoints,
    outfile: join(output, 'express', 'index.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external,
    watch: watcher(config),
  });
}
