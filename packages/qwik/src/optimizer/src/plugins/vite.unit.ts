import path, { resolve } from 'node:path';
import { qwikVite } from './vite';
import type { OptimizerOptions } from '../types';
import type { Rollup } from 'vite';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { normalizePath } from '../../../testing/util';

const cwd = process.cwd();

function mockOptimizerOptions(): OptimizerOptions {
  return {
    sys: {
      cwd: () => process.cwd(),
      env: 'node',
      os: process.platform,
      dynamicImport: async (path) => import(path),
      strictDynamicImport: async (path) => import(path),
      path: path as any,
    },
    binding: { mockBinding: true },
  };
}

const vite = suite('vite plugin');

const includeDeps = undefined;
const noExternal = ['@builder.io/qwik', '@builder.io/qwik/server', '@builder.io/qwik/build'];

const excludeDeps = [
  '@vite/client',
  '@vite/env',
  'node-fetch',
  'undici',
  '@builder.io/qwik',
  '@builder.io/qwik/server',
  '@builder.io/qwik/jsx-runtime',
  '@builder.io/qwik/jsx-dev-runtime',
  '@builder.io/qwik/build',
  '@qwik-client-manifest',
];

vite('command: serve, mode: development', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts);
  const c = (await plugin.config({}, { command: 'serve', mode: 'development' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;

  equal(opts.target, 'client');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'hook' });
  equal(opts.debug, false);

  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(rollupOptions.input, normalizePath(resolve(cwd, 'src', 'entry.dev.tsx')));
  equal(outputOptions.assetFileNames, 'build/q-[hash].[ext]');
  equal(outputOptions.chunkFileNames, 'build/[name].js');
  equal(outputOptions.entryFileNames, 'build/[name].js');
  equal(outputOptions.format, 'es');
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, undefined);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);

  equal(c.esbuild, false);
  equal(c.ssr, {
    noExternal,
  });
});

vite('command: serve, mode: production', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts);
  const c = (await plugin.config({}, { command: 'serve', mode: 'production' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;

  equal(opts.target, 'client');
  equal(opts.buildMode, 'production');
  equal(opts.entryStrategy, { type: 'hook' });
  equal(opts.debug, false);
  equal(opts.resolveQwikBuild, true);

  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(build.emptyOutDir, undefined);
  equal(rollupOptions.input, normalizePath(resolve(cwd, 'src', 'entry.dev.tsx')));
  equal(outputOptions.assetFileNames, 'build/q-[hash].[ext]');
  equal(outputOptions.chunkFileNames, 'build/q-[hash].js');
  equal(outputOptions.entryFileNames, 'build/q-[hash].js');
  equal(outputOptions.format, 'es');
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, undefined);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);
  equal(c.esbuild, false);
  equal(c.ssr, {
    noExternal,
  });
});

vite('command: build, mode: development', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts);
  const c = (await plugin.config({}, { command: 'build', mode: 'development' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;

  equal(opts.target, 'client');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'hook' });
  equal(opts.debug, false);
  equal(opts.resolveQwikBuild, true);

  equal(plugin.enforce, 'pre');
  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(build.emptyOutDir, undefined);
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root.tsx'))]);
  equal(outputOptions.assetFileNames, 'build/q-[hash].[ext]');
  equal(outputOptions.chunkFileNames, 'build/[name].js');
  equal(outputOptions.entryFileNames, 'build/[name].js');
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, undefined);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);
  equal(c.esbuild, {
    logLevel: 'error',
    jsx: 'automatic',
  });
  equal(c.ssr, {
    noExternal,
  });
});

vite('command: build, mode: production', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts);
  const c = (await plugin.config({}, { command: 'build', mode: 'production' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;

  equal(opts.target, 'client');
  equal(opts.buildMode, 'production');
  equal(opts.entryStrategy, { type: 'smart' });
  equal(opts.debug, false);
  equal(opts.resolveQwikBuild, true);

  equal(plugin.enforce, 'pre');
  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(build.emptyOutDir, undefined);
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root.tsx'))]);
  equal(outputOptions.assetFileNames, 'build/q-[hash].[ext]');
  equal(outputOptions.chunkFileNames, 'build/q-[hash].js');
  equal(outputOptions.entryFileNames, 'build/q-[hash].js');
  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, undefined);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);
  equal(c.esbuild, {
    logLevel: 'error',
    jsx: 'automatic',
  });
  equal(c.ssr, {
    noExternal,
  });
});

vite('command: build, --mode production (client)', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    client: {
      devInput: resolve(cwd, 'src', 'dev.entry.tsx'),
      outDir: resolve(cwd, 'client-dist'),
    },
  };

  const plugin = qwikVite(initOpts);
  const c: any = (await plugin.config({}, { command: 'build', mode: 'production' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  equal(opts.resolveQwikBuild, true);

  equal(opts.target, 'client');
  equal(opts.buildMode, 'production');
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root.tsx'))]);
  equal(build.outDir, normalizePath(resolve(cwd, 'client-dist')));
  equal(build.emptyOutDir, undefined);
});

vite('command: build, --ssr entry.server.tsx', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts);
  const c = (await plugin.config(
    { build: { ssr: resolve(cwd, 'src', 'entry.server.tsx') } },
    { command: 'build', mode: '' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as Rollup.OutputOptions;

  equal(opts.target, 'ssr');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'hoist' });
  equal(opts.debug, false);
  equal(opts.resolveQwikBuild, true);

  equal(plugin.enforce, 'pre');
  equal(build.outDir, normalizePath(resolve(cwd, 'server')));
  equal(build.emptyOutDir, undefined);
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'entry.server.tsx'))]);
  equal(outputOptions.assetFileNames, 'build/q-[hash].[ext]');
  equal(outputOptions.chunkFileNames, undefined);
  equal(outputOptions.entryFileNames, undefined);
  equal(build.outDir, normalizePath(resolve(cwd, 'server')));
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, true);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);
  equal(c.esbuild, {
    logLevel: 'error',
    jsx: 'automatic',
  });
  equal(c.publicDir, false);
});

vite('command: serve, --mode ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    ssr: {
      input: resolve(cwd, 'src', 'renderz.tsx'),
      outDir: resolve(cwd, 'ssr-dist'),
    },
  };
  const plugin = qwikVite(initOpts);
  const c: any = (await plugin.config(
    { build: { emptyOutDir: true } },
    { command: 'serve', mode: 'ssr' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;

  equal(opts.target, 'ssr');
  equal(opts.buildMode, 'development');
  equal(build.minify, undefined);
  equal(build.ssr, undefined);
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'renderz.tsx'))]);
  equal(c.build.outDir, normalizePath(resolve(cwd, 'ssr-dist')));
  equal(build.emptyOutDir, undefined);
  equal(c.publicDir, undefined);
  equal(opts.resolveQwikBuild, true);
});

vite('command: build, --mode lib', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikVite(initOpts);
  const c: any = (await plugin.config(
    {
      build: {
        lib: {
          entry: './src/index.ts',
          formats: ['es', 'cjs'],
        },
      },
    },
    { command: 'build', mode: 'lib' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;

  equal(opts.target, 'lib');
  equal(opts.buildMode, 'development');
  equal(build.minify, false);
  equal(build.ssr, undefined);
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'index.ts'))]);
  equal(c.build.outDir, normalizePath(resolve(cwd, 'lib')));
  equal(build.emptyOutDir, undefined);
  equal(opts.resolveQwikBuild, true);
});

vite.run();
