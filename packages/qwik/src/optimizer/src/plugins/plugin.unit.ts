import { resolve } from 'path';
import type { QwikManifest } from '../types';
import { createPlugin } from './plugin';

describe('qwik plugin', () => {
  const cwd = process.cwd();

  describe('normalizeOptions', () => {
    it('defaults', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions();
      expect(opts.target).toBe('client');
      expect(opts.buildMode).toBe('development');
      expect(opts.entryStrategy).toEqual({ type: 'hook' });
      expect(opts.forceFullBuild).toBe(false);
      expect(opts.debug).toBe(false);
      expect(opts.rootDir).toBe(cwd);
      expect(opts.outClientDir).toBe(resolve(cwd, 'dist'));
      expect(opts.outServerDir).toBe(resolve(cwd, 'server'));
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
      expect(opts.srcRootInput).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(opts.srcEntryServerInput).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(opts.manifestInput).toBe(null);
      expect(opts.manifestOutput).toBe(null);
    });

    it('defaults (buildMode: production)', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ buildMode: 'production' });
      expect(opts.target).toBe('client');
      expect(opts.buildMode).toBe('production');
      expect(opts.entryStrategy).toEqual({ type: 'smart' });
      expect(opts.forceFullBuild).toBe(true);
      expect(opts.debug).toBe(false);
      expect(opts.rootDir).toBe(cwd);
      expect(opts.outClientDir).toBe(resolve(cwd, 'dist'));
      expect(opts.outServerDir).toBe(resolve(cwd, 'server'));
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
      expect(opts.srcRootInput).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(opts.srcEntryServerInput).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(opts.entryStrategy).toEqual({ type: 'smart' });
      expect(opts.manifestInput).toBe(null);
      expect(opts.manifestOutput).toBe(null);
    });

    it('defaults (target: ssr)', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ target: 'ssr' });
      expect(opts.target).toBe('ssr');
      expect(opts.buildMode).toBe('development');
      expect(opts.entryStrategy).toEqual({ type: 'hook' });
      expect(opts.forceFullBuild).toBe(false);
      expect(opts.debug).toBe(false);
      expect(opts.rootDir).toBe(cwd);
      expect(opts.outClientDir).toBe(resolve(cwd, 'dist'));
      expect(opts.outServerDir).toBe(resolve(cwd, 'server'));
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
      expect(opts.srcRootInput).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(opts.srcEntryServerInput).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(opts.manifestInput).toBe(null);
      expect(opts.manifestOutput).toBe(null);
    });

    it('defaults (buildMode: production, target: ssr)', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ buildMode: 'production', target: 'ssr' });
      expect(opts.target).toBe('ssr');
      expect(opts.buildMode).toBe('production');
      expect(opts.entryStrategy).toEqual({ type: 'smart' });
      expect(opts.forceFullBuild).toBe(true);
      expect(opts.debug).toBe(false);
      expect(opts.rootDir).toBe(cwd);
      expect(opts.outClientDir).toBe(resolve(cwd, 'dist'));
      expect(opts.outServerDir).toBe(resolve(cwd, 'server'));
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
      expect(opts.srcRootInput).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(opts.srcEntryServerInput).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(opts.manifestInput).toBe(null);
      expect(opts.manifestOutput).toBe(null);
    });

    it('debug true', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ debug: true });
      expect(opts.debug).toBe(true);
    });

    it('override entryStrategy', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({
        entryStrategy: { type: 'component' },
        buildMode: 'production',
      });
      expect(opts.entryStrategy.type).toBe('component');
    });

    it('entryStrategy, smart', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({
        entryStrategy: { type: 'smart' },
        forceFullBuild: false,
      });
      expect(opts.entryStrategy.type).toBe('smart');
      expect(opts.forceFullBuild).toBe(true);
    });

    it('entryStrategy, hook no forceFullBuild', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ entryStrategy: { type: 'hook' } });
      expect(opts.entryStrategy.type).toBe('hook');
      expect(opts.forceFullBuild).toBe(false);
    });

    it('entryStrategy, hook and srcInputs', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({
        entryStrategy: { type: 'hook' },
        srcInputs: [],
      });
      expect(opts.entryStrategy.type).toBe('hook');
      expect(opts.forceFullBuild).toBe(true);
    });

    it('entryStrategy, forceFullBuild false', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ forceFullBuild: false });
      expect(opts.forceFullBuild).toBe(false);
    });

    it('entryStrategy, forceFullBuild true', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ forceFullBuild: true });
      expect(opts.forceFullBuild).toBe(true);
    });

    it('rootDir, abs path', async () => {
      const plugin = mockPlugin();
      const customRoot = resolve(cwd, 'abs-path');
      const opts = await plugin.normalizeOptions({ rootDir: customRoot });
      expect(opts.rootDir).toBe(customRoot);
    });

    it('rootDir, rel path', async () => {
      const plugin = mockPlugin();
      const customRoot = 'rel-path';
      const opts = await plugin.normalizeOptions({ rootDir: customRoot });
      expect(opts.rootDir).toBe(resolve(cwd, customRoot));
    });

    it('manifestInput', async () => {
      const plugin = mockPlugin();
      const manifestInput: QwikManifest = { mapping: {}, symbols: {}, bundles: {}, version: '1' };
      const opts = await plugin.normalizeOptions({ manifestInput });
      expect(opts.manifestInput).toBe(manifestInput);
    });

    it('manifestOutput', async () => {
      const plugin = mockPlugin();
      const manifestOutput = () => {};
      const opts = await plugin.normalizeOptions({ manifestOutput });
      expect(opts.manifestOutput).toBe(manifestOutput);
    });
  });

  function mockPlugin() {
    return createPlugin({
      sys: {
        cwd: () => process.cwd(),
        env: () => 'node',
        dynamicImport: async (path) => require(path),
        path: require('path'),
      },
      binding: { mockBinding: true },
    });
  }
});
