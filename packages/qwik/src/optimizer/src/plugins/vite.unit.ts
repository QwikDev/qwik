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

  describe('config', () => {
    it('command: serve, missing mode - defaults', async () => {
      const plugin: VitePlugin = qwikVite(initOpts);
      const c = (await plugin.config!({}, { command: 'serve', mode: 'development' }))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;
      const outputOptions = rollupOptions.output as OutputOptions;

      expect(build.outDir).toBe(resolve(cwd, 'dist'));
      expect(rollupOptions.input).toEqual(resolve(cwd, 'src', 'entry.dev.tsx'));
      expect(outputOptions.assetFileNames).toBe('build/[name].[ext]');
      expect(outputOptions.chunkFileNames).toBe('build/[name].js');
      expect(outputOptions.entryFileNames).toBe('build/[name].js');
      expect(build.polyfillModulePreload).toBe(false);
      expect(build.dynamicImportVarsOptions?.exclude).toEqual([/./]);
      expect(build.ssr).toBe(undefined);
      expect(c.optimizeDeps?.include).toEqual(['@builder.io/qwik', '@builder.io/qwik/jsx-runtime']);
      expect(c.esbuild).toEqual({ include: /\.js$/ });
      expect((c as any).ssr).toBeUndefined();

      expect(opts.debug).toBe(false);
      expect(opts.isDevBuild).toBe(true);
      expect(opts.buildMode).toBe('client');
      expect(opts.entryStrategy).toEqual({ type: 'hook' });
    });

    it('command: build, mode not set - defaults', async () => {
      const plugin: VitePlugin = qwikVite(initOpts);
      const c = (await plugin.config!({}, { command: 'build', mode: 'production' }))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;
      const outputOptions = rollupOptions.output as OutputOptions;

      expect(plugin.enforce).toBe('pre');
      expect(build.outDir).toBe(resolve(cwd, 'dist'));
      expect(rollupOptions.input).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(outputOptions.assetFileNames).toBe('build/q-[hash].[ext]');
      expect(outputOptions.chunkFileNames).toBe('build/q-[hash].js');
      expect(outputOptions.entryFileNames).toBe('build/q-[hash].js');
      expect(build.polyfillModulePreload).toBe(false);
      expect(build.dynamicImportVarsOptions?.exclude).toEqual([/./]);
      expect(build.ssr).toBe(undefined);
      expect(c.optimizeDeps?.include).toEqual(['@builder.io/qwik', '@builder.io/qwik/jsx-runtime']);
      expect(c.esbuild).toEqual({ include: /\.js$/ });
      expect((c as any).ssr).toBeUndefined();

      expect(opts.debug).toBe(false);
      expect(opts.isDevBuild).toBe(false);
      expect(opts.buildMode).toBe('client');
      expect(opts.entryStrategy).toEqual({ type: 'hook' });
    });

    it('command: build, mode: ssr - defaults', async () => {
      const plugin: VitePlugin = qwikVite(initOpts);
      const c = (await plugin.config!({}, { command: 'build', mode: 'ssr' }))!;
      const opts = await plugin.api?.getOptions();
      const build = c.build!;
      const rollupOptions = build!.rollupOptions!;
      const outputOptions = rollupOptions.output as OutputOptions;

      expect(plugin.enforce).toBe('pre');
      expect(build.outDir).toBe(resolve(cwd, 'server'));
      expect(rollupOptions.input).toEqual(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(outputOptions.assetFileNames).toBe('[name].[ext]');
      expect(outputOptions.chunkFileNames).toBe('[name].js');
      expect(outputOptions.entryFileNames).toBe('[name].js');
      expect(build.polyfillModulePreload).toBe(false);
      expect(build.dynamicImportVarsOptions?.exclude).toEqual([/./]);
      expect(build.ssr).toBe(true);
      expect(c.optimizeDeps?.include).toEqual(['@builder.io/qwik', '@builder.io/qwik/jsx-runtime']);
      expect(c.esbuild).toEqual({ include: /\.js$/ });
      expect((c as any).ssr).toEqual({ noExternal: true });

      expect(opts.debug).toBe(false);
      expect(opts.isDevBuild).toBe(false);
      expect(opts.buildMode).toBe('ssr');
      expect(opts.entryStrategy).toEqual({ type: 'hook' });
    });
  });

  function mockOptimizerOptions(): OptimizerOptions {
    return {
      sys: {
        cwd: () => process.cwd(),
        env: () => 'node',
        dynamicImport: async (path) => require(path),
        path: require('path'),
      },
      binding: { mockBinding: true },
    };
  }
});
