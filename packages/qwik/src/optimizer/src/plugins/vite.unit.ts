import { resolve } from 'path';
import { qwikVite, QwikVitePluginOptions } from './vite';
import type { Plugin as VitePlugin } from 'vite';
import type { OptimizerOptions } from '../types';
import type { OutputOptions } from 'rollup';

describe('vite  plugin', () => {
  const cwd = process.cwd();
  let initOpts: QwikVitePluginOptions = {};

  beforeEach(() => {
    initOpts = {
      optimizerOptions: mockOptimizerOptions(),
    };
  });

  const includeDeps = undefined;
  const excludeDeps = [
    '@vite/client',
    '@vite/env',
    '@builder.io/qwik',
    '@builder.io/qwik/jsx-runtime',
    '@builder.io/qwik/build',
    '@qwik-client-manifest',
  ];

  describe('config', () => {
    it('command: serve, mode: development', async () => {
      const plugin: VitePlugin = qwikVite(initOpts);
      const c = (await plugin.config!({}, { command: 'serve', mode: 'development' }))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;
      const outputOptions = rollupOptions.output as OutputOptions;

      expect(opts.target).toBe('client');
      expect(opts.buildMode).toBe('development');
      expect(opts.entryStrategy).toEqual({ type: 'hook' });
      expect(opts.debug).toBe(false);
      expect(opts.forceFullBuild).toBe(false);

      expect(build.outDir).toBe(resolve(cwd, 'dist'));
      expect(rollupOptions.input).toEqual(resolve(cwd, 'src', 'entry.dev.tsx'));
      expect(outputOptions.assetFileNames).toBe('build/[name].[ext]');
      expect(outputOptions.chunkFileNames).toBe('build/[name].js');
      expect(outputOptions.entryFileNames).toBe('build/[name].js');
      expect(outputOptions.format).toBe('es');
      expect(build.polyfillModulePreload).toBe(false);
      expect(build.dynamicImportVarsOptions?.exclude).toEqual([/./]);
      expect(build.ssr).toBe(undefined);
      expect(c.optimizeDeps?.include).toEqual(includeDeps);
      expect(c.optimizeDeps?.exclude).toEqual(excludeDeps);

      expect(c.esbuild).toEqual(undefined);
      expect((c as any).ssr).toBeUndefined();
    });

    it('command: serve, mode: production', async () => {
      const plugin: VitePlugin = qwikVite(initOpts);
      const c = (await plugin.config!({}, { command: 'serve', mode: 'production' }))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;
      const outputOptions = rollupOptions.output as OutputOptions;

      expect(opts.target).toBe('client');
      expect(opts.buildMode).toBe('production');
      expect(opts.entryStrategy).toEqual({ type: 'hook' });
      expect(opts.debug).toBe(false);
      expect(opts.forceFullBuild).toBe(false);

      expect(build.outDir).toBe(resolve(cwd, 'dist'));
      expect(rollupOptions.input).toEqual(resolve(cwd, 'src', 'entry.dev.tsx'));
      expect(outputOptions.assetFileNames).toBe('build/q-[hash].[ext]');
      expect(outputOptions.chunkFileNames).toBe('build/q-[hash].js');
      expect(outputOptions.entryFileNames).toBe('build/q-[hash].js');
      expect(outputOptions.format).toBe('es');
      expect(build.polyfillModulePreload).toBe(false);
      expect(build.dynamicImportVarsOptions?.exclude).toEqual([/./]);
      expect(build.ssr).toBe(undefined);
      expect(c.optimizeDeps?.include).toEqual(includeDeps);
      expect(c.optimizeDeps?.exclude).toEqual(excludeDeps);
      expect(c.esbuild).toEqual(undefined);
      expect((c as any).ssr).toBeUndefined();
    });
    it('command: build, mode: development', async () => {
      const plugin: VitePlugin = qwikVite(initOpts);
      const c = (await plugin.config!({}, { command: 'build', mode: 'development' }))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;
      const outputOptions = rollupOptions.output as OutputOptions;

      expect(opts.target).toBe('client');
      expect(opts.buildMode).toBe('development');
      expect(opts.entryStrategy).toEqual({ type: 'hook' });
      expect(opts.debug).toBe(false);
      expect(opts.forceFullBuild).toBe(true);

      expect(plugin.enforce).toBe('pre');
      expect(build.outDir).toBe(resolve(cwd, 'dist'));
      expect(rollupOptions.input).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(outputOptions.assetFileNames).toBe('build/[name].[ext]');
      expect(outputOptions.chunkFileNames).toBe('build/[name].js');
      expect(outputOptions.entryFileNames).toBe('build/[name].js');
      expect(build.polyfillModulePreload).toBe(false);
      expect(build.dynamicImportVarsOptions?.exclude).toEqual([/./]);
      expect(build.ssr).toBe(undefined);
      expect(c.optimizeDeps?.include).toEqual(includeDeps);
      expect(c.optimizeDeps?.exclude).toEqual(excludeDeps);
      expect(c.esbuild).toEqual(undefined);
      expect((c as any).ssr).toBeUndefined();
    });

    it('command: build, mode: production', async () => {
      const plugin: VitePlugin = qwikVite(initOpts);
      const c = (await plugin.config!({}, { command: 'build', mode: 'production' }))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;
      const outputOptions = rollupOptions.output as OutputOptions;

      expect(opts.target).toBe('client');
      expect(opts.buildMode).toBe('production');
      expect(opts.entryStrategy).toEqual({ type: 'smart' });
      expect(opts.debug).toBe(false);
      expect(opts.forceFullBuild).toBe(true);

      expect(plugin.enforce).toBe('pre');
      expect(build.outDir).toBe(resolve(cwd, 'dist'));
      expect(rollupOptions.input).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(outputOptions.assetFileNames).toBe('build/q-[hash].[ext]');
      expect(outputOptions.chunkFileNames).toBe('build/q-[hash].js');
      expect(outputOptions.entryFileNames).toBe('build/q-[hash].js');
      expect(build.outDir).toEqual(resolve(cwd, 'dist'));
      expect(build.polyfillModulePreload).toBe(false);
      expect(build.dynamicImportVarsOptions?.exclude).toEqual([/./]);
      expect(build.ssr).toBe(undefined);
      expect(c.optimizeDeps?.include).toEqual(includeDeps);
      expect(c.optimizeDeps?.exclude).toEqual(excludeDeps);
      expect(c.esbuild).toEqual(undefined);
      expect((c as any).ssr).toBeUndefined();
    });

    it('command: build, --mode production (client)', async () => {
      initOpts.client = {
        devInput: resolve(cwd, 'src', 'dev.entry.tsx'),
        outDir: resolve(cwd, 'client-dist'),
      };
      const plugin: VitePlugin = qwikVite(initOpts);
      const c: any = (await plugin.config!({}, { command: 'build', mode: 'production' }))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;

      expect(opts.target).toBe('client');
      expect(opts.buildMode).toBe('production');
      expect(rollupOptions.input).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(build.outDir).toEqual(resolve(cwd, 'client-dist'));
    });

    it('command: build, --ssr entry.express.tsx', async () => {
      const plugin: VitePlugin = qwikVite(initOpts);
      const c = (await plugin.config!(
        { build: { ssr: resolve(cwd, 'src', 'entry.express.tsx') } },
        { command: 'build', mode: '' }
      ))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;
      const outputOptions = rollupOptions.output as OutputOptions;

      expect(opts.target).toBe('ssr');
      expect(opts.buildMode).toBe('development');
      expect(opts.entryStrategy).toEqual({ type: 'inline' });
      expect(opts.debug).toBe(false);
      expect(opts.forceFullBuild).toBe(true);

      expect(plugin.enforce).toBe('pre');
      expect(build.outDir).toBe(resolve(cwd, 'server'));
      expect(rollupOptions.input).toEqual([resolve(cwd, 'src', 'entry.express.tsx')]);
      expect(outputOptions.assetFileNames).toBe('[name].[ext]');
      expect(outputOptions.chunkFileNames).toBe('[name].js');
      expect(outputOptions.entryFileNames).toBe('[name].js');
      expect(build.outDir).toEqual(resolve(cwd, 'server'));
      expect(build.polyfillModulePreload).toBe(false);
      expect(build.dynamicImportVarsOptions?.exclude).toEqual([/./]);
      expect(build.ssr).toBe(true);
      expect(c.optimizeDeps?.include).toEqual(includeDeps);
      expect(c.optimizeDeps?.exclude).toEqual(excludeDeps);
      expect(c.esbuild).toEqual(undefined);
      expect(c.publicDir).toBe(false);
    });

    it('command: serve, --mode ssr', async () => {
      initOpts.ssr = {
        input: resolve(cwd, 'src', 'renderz.tsx'),
        outDir: resolve(cwd, 'ssr-dist'),
      };
      const plugin: VitePlugin = qwikVite(initOpts);
      const c: any = (await plugin.config!({}, { command: 'serve', mode: 'ssr' }))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;

      expect(opts.target).toBe('ssr');
      expect(opts.buildMode).toBe('development');
      expect(rollupOptions.input).toEqual([resolve(cwd, 'src', 'renderz.tsx')]);
      expect(c.build.outDir).toEqual(resolve(cwd, 'ssr-dist'));
      expect(c.publicDir).toBe(undefined);
    });
  });

  function mockOptimizerOptions(): OptimizerOptions {
    return {
      sys: {
        cwd: () => process.cwd(),
        env: 'node',
        os: process.platform,
        dynamicImport: async (path) => require(path),
        path: require('path'),
      },
      binding: { mockBinding: true },
    };
  }
});
