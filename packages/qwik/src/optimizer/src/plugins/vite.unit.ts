import path, { resolve } from 'path';
import { qwikVite } from './vite';
import type { Plugin as VitePlugin } from 'vite';
import type { OptimizerOptions } from '../types';
import type { OutputOptions } from 'rollup';
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
const excludeDeps = [
  '@vite/client',
  '@vite/env',
  '@builder.io/qwik',
  '@builder.io/qwik/jsx-runtime',
  '@builder.io/qwik/build',
  '@qwik-client-manifest',
];

vite('command: serve, mode: development', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin: VitePlugin = qwikVite(initOpts);
  const c = (await plugin.config!({}, { command: 'serve', mode: 'development' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as OutputOptions;

  equal(opts.target, 'client');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'hook' });
  equal(opts.debug, false);
  equal(opts.forceFullBuild, false);

  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(rollupOptions.input, normalizePath(resolve(cwd, 'src', 'entry.dev.tsx')));
  equal(outputOptions.assetFileNames, 'build/[name].[ext]');
  equal(outputOptions.chunkFileNames, 'build/[name].js');
  equal(outputOptions.entryFileNames, 'build/[name].js');
  equal(outputOptions.format, 'es');
  equal(build.polyfillModulePreload, false);
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, undefined);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);

  equal(c.esbuild, undefined);
  equal(c.ssr, undefined);
});

vite('command: serve, mode: production', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin: VitePlugin = qwikVite(initOpts);
  const c = (await plugin.config!({}, { command: 'serve', mode: 'production' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as OutputOptions;

  equal(opts.target, 'client');
  equal(opts.buildMode, 'production');
  equal(opts.entryStrategy, { type: 'hook' });
  equal(opts.debug, false);
  equal(opts.forceFullBuild, false);

  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(rollupOptions.input, normalizePath(resolve(cwd, 'src', 'entry.dev.tsx')));
  equal(outputOptions.assetFileNames, 'build/q-[hash].[ext]');
  equal(outputOptions.chunkFileNames, 'build/q-[hash].js');
  equal(outputOptions.entryFileNames, 'build/q-[hash].js');
  equal(outputOptions.format, 'es');
  equal(build.polyfillModulePreload, false);
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, undefined);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);
  equal(c.esbuild, undefined);
  equal(c.ssr, undefined);
});
vite('command: build, mode: development', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin: VitePlugin = qwikVite(initOpts);
  const c = (await plugin.config!({}, { command: 'build', mode: 'development' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as OutputOptions;

  equal(opts.target, 'client');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'hook' });
  equal(opts.debug, false);
  equal(opts.forceFullBuild, true);

  equal(plugin.enforce, 'pre');
  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root.tsx'))]);
  equal(outputOptions.assetFileNames, 'build/[name].[ext]');
  equal(outputOptions.chunkFileNames, 'build/[name].js');
  equal(outputOptions.entryFileNames, 'build/[name].js');
  equal(build.polyfillModulePreload, false);
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, undefined);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);
  equal(c.esbuild, undefined);
  equal(c.ssr, undefined);
});

vite('command: build, mode: production', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin: VitePlugin = qwikVite(initOpts);
  const c = (await plugin.config!({}, { command: 'build', mode: 'production' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as OutputOptions;

  equal(opts.target, 'client');
  equal(opts.buildMode, 'production');
  equal(opts.entryStrategy, { type: 'smart' });
  equal(opts.debug, false);
  equal(opts.forceFullBuild, true);

  equal(plugin.enforce, 'pre');
  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root.tsx'))]);
  equal(outputOptions.assetFileNames, 'build/q-[hash].[ext]');
  equal(outputOptions.chunkFileNames, 'build/q-[hash].js');
  equal(outputOptions.entryFileNames, 'build/q-[hash].js');
  equal(build.outDir, normalizePath(resolve(cwd, 'dist')));
  equal(build.polyfillModulePreload, false);
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, undefined);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);
  equal(c.esbuild, undefined);
  equal(c.ssr, undefined);
});

vite('command: build, --mode production (client)', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    client: {
      devInput: resolve(cwd, 'src', 'dev.entry.tsx'),
      outDir: resolve(cwd, 'client-dist'),
    },
  };

  const plugin: VitePlugin = qwikVite(initOpts);
  const c: any = (await plugin.config!({}, { command: 'build', mode: 'production' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;

  equal(opts.target, 'client');
  equal(opts.buildMode, 'production');
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'root.tsx'))]);
  equal(build.outDir, normalizePath(resolve(cwd, 'client-dist')));
});

vite('command: build, --ssr entry.express.tsx', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin: VitePlugin = qwikVite(initOpts);
  const c = (await plugin.config!(
    { build: { ssr: resolve(cwd, 'src', 'entry.express.tsx') } },
    { command: 'build', mode: '' }
  ))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;
  const outputOptions = rollupOptions.output as OutputOptions;

  equal(opts.target, 'ssr');
  equal(opts.buildMode, 'development');
  equal(opts.entryStrategy, { type: 'inline' });
  equal(opts.debug, false);
  equal(opts.forceFullBuild, true);

  equal(plugin.enforce, 'pre');
  equal(build.outDir, normalizePath(resolve(cwd, 'server')));
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'entry.express.tsx'))]);
  equal(outputOptions.assetFileNames, undefined);
  equal(outputOptions.chunkFileNames, undefined);
  equal(outputOptions.entryFileNames, undefined);
  equal(build.outDir, normalizePath(resolve(cwd, 'server')));
  equal(build.polyfillModulePreload, false);
  equal(build.dynamicImportVarsOptions?.exclude, [/./]);
  equal(build.ssr, true);
  equal(c.optimizeDeps?.include, includeDeps);
  equal(c.optimizeDeps?.exclude, excludeDeps);
  equal(c.esbuild, undefined);
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
  const plugin: VitePlugin = qwikVite(initOpts);
  const c: any = (await plugin.config!({}, { command: 'serve', mode: 'ssr' }))!;
  const opts = await plugin.api?.getOptions();
  const build = c.build!;
  const rollupOptions = build!.rollupOptions!;

  equal(opts.target, 'ssr');
  equal(opts.buildMode, 'development');
  equal(build.ssr, undefined);
  equal(rollupOptions.input, [normalizePath(resolve(cwd, 'src', 'renderz.tsx'))]);
  equal(c.build.outDir, normalizePath(resolve(cwd, 'ssr-dist')));
  equal(c.publicDir, undefined);
});

vite.run();
