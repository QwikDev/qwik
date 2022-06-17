import { resolve } from 'path';
import type { QwikManifest } from '../types';
import { createPlugin } from './plugin';

describe('qwik plugin', () => {
  const cwd = process.cwd();

  describe('normalizeOptions', () => {
    it('defaults', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions();
      expect(opts.target).toBe('client');
      expect(opts.buildMode).toBe('development');
      expect(opts.entryStrategy).toEqual({ type: 'hook' });
      expect(opts.forceFullBuild).toBe(false);
      expect(opts.debug).toBe(false);
      expect(opts.rootDir).toBe(cwd);
      expect(opts.input).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(opts.outDir).toBe(resolve(cwd, 'dist'));
      expect(opts.manifestInput).toBe(null);
      expect(opts.manifestOutput).toBe(null);
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
    });

    it('defaults (buildMode: production)', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({ buildMode: 'production' });
      expect(opts.target).toBe('client');
      expect(opts.buildMode).toBe('production');
      expect(opts.entryStrategy).toEqual({ type: 'smart' });
      expect(opts.forceFullBuild).toBe(true);
      expect(opts.debug).toBe(false);
      expect(opts.rootDir).toBe(cwd);
      expect(opts.input).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(opts.outDir).toBe(resolve(cwd, 'dist'));
      expect(opts.manifestInput).toBe(null);
      expect(opts.manifestOutput).toBe(null);
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
      expect(opts.entryStrategy).toEqual({ type: 'smart' });
    });

    it('defaults (target: ssr)', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({ target: 'ssr' });
      expect(opts.target).toBe('ssr');
      expect(opts.buildMode).toBe('development');
      expect(opts.entryStrategy).toEqual({ type: 'inline' });
      expect(opts.forceFullBuild).toBe(false);
      expect(opts.debug).toBe(false);
      expect(opts.rootDir).toBe(cwd);
      expect(opts.input).toEqual([resolve(cwd, 'src', 'entry.ssr.tsx')]);
      expect(opts.outDir).toBe(resolve(cwd, 'server'));
      expect(opts.manifestInput).toBe(null);
      expect(opts.manifestOutput).toBe(null);
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
    });

    it('defaults (buildMode: production, target: ssr)', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({ buildMode: 'production', target: 'ssr' });
      expect(opts.target).toBe('ssr');
      expect(opts.buildMode).toBe('production');
      expect(opts.entryStrategy).toEqual({ type: 'inline' });
      expect(opts.forceFullBuild).toBe(false);
      expect(opts.debug).toBe(false);
      expect(opts.rootDir).toBe(cwd);
      expect(opts.input).toEqual([resolve(cwd, 'src', 'entry.ssr.tsx')]);
      expect(opts.outDir).toBe(resolve(cwd, 'server'));
      expect(opts.manifestInput).toBe(null);
      expect(opts.manifestOutput).toBe(null);
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
    });

    it('debug true', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({ debug: true });
      expect(opts.debug).toBe(true);
    });

    it('override entryStrategy', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({
        entryStrategy: { type: 'component' },
        buildMode: 'production',
      });
      expect(opts.entryStrategy.type).toBe('component');
    });

    it('entryStrategy, smart', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({
        entryStrategy: { type: 'smart' },
        forceFullBuild: false,
      });
      expect(opts.entryStrategy.type).toBe('smart');
      expect(opts.forceFullBuild).toBe(true);
    });

    it('entryStrategy, hook no forceFullBuild', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({ entryStrategy: { type: 'hook' } });
      expect(opts.entryStrategy.type).toBe('hook');
      expect(opts.forceFullBuild).toBe(false);
    });

    it('entryStrategy, hook and srcInputs', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({
        entryStrategy: { type: 'hook' },
        srcInputs: [],
      });
      expect(opts.entryStrategy.type).toBe('hook');
      expect(opts.forceFullBuild).toBe(true);
    });

    it('entryStrategy, forceFullBuild false', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({ forceFullBuild: false });
      expect(opts.forceFullBuild).toBe(false);
    });

    it('entryStrategy, forceFullBuild true', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({ forceFullBuild: true });
      expect(opts.forceFullBuild).toBe(true);
    });

    it('rootDir, abs path', async () => {
      const plugin = await mockPlugin();
      const customRoot = resolve(cwd, 'abs-path');
      const opts = plugin.normalizeOptions({ rootDir: customRoot });
      expect(opts.rootDir).toBe(customRoot);
    });

    it('rootDir, rel path', async () => {
      const plugin = await mockPlugin();
      const customRoot = 'rel-path';
      const opts = plugin.normalizeOptions({ rootDir: customRoot });
      expect(opts.rootDir).toBe(resolve(cwd, customRoot));
    });

    it('input string', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({ input: 'src/cmps/main.tsx' });
      expect(opts.input).toEqual([resolve(cwd, 'src', 'cmps', 'main.tsx')]);
    });

    it('input array', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({
        input: ['src/cmps/a.tsx', 'src/cmps/b.tsx'],
      });
      expect(opts.input).toEqual([
        resolve(cwd, 'src', 'cmps', 'a.tsx'),
        resolve(cwd, 'src', 'cmps', 'b.tsx'),
      ]);
    });

    it('outDir', async () => {
      const plugin = await mockPlugin();
      const opts = plugin.normalizeOptions({ outDir: 'out' });
      expect(opts.outDir).toBe(resolve(cwd, 'out'));
    });

    it('manifestOutput', async () => {
      const plugin = await mockPlugin();
      const manifestOutput = () => {};
      const opts = plugin.normalizeOptions({ manifestOutput });
      expect(opts.manifestOutput).toBe(manifestOutput);
    });

    it(' manifestInput', async () => {
      const plugin = await mockPlugin();
      const manifestInput: QwikManifest = { mapping: {}, symbols: {}, bundles: {}, version: '1' };
      const opts = plugin.normalizeOptions({ manifestInput });
      expect(opts.manifestInput).toBe(manifestInput);
    });
  });

  async function mockPlugin() {
    const plugin = createPlugin({
      sys: {
        cwd: () => process.cwd(),
        env: 'node',
        os: process.platform,
        dynamicImport: async (path) => require(path),
        path: require('path'),
      },
      binding: { mockBinding: true },
    });
    await plugin.init();
    return plugin;
  }
});
