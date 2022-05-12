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
      expect(opts.client.input).toEqual([resolve(cwd, 'src', 'components', 'app', 'app.tsx')]);
      expect(opts.client.outDir).toBe(resolve(cwd, 'dist'));
      expect(opts.client.manifestOutput).toBe(null);
      expect(opts.ssr.input).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(opts.ssr.renderInput).toBe(resolve(cwd, 'src', 'entry.ssr.tsx'));
      expect(opts.ssr.outDir).toBe(resolve(cwd, 'server'));
      expect(opts.ssr.manifestInput).toBe(null);
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
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
      expect(opts.client.input).toEqual([resolve(cwd, 'src', 'components', 'app', 'app.tsx')]);
      expect(opts.client.outDir).toBe(resolve(cwd, 'dist'));
      expect(opts.client.manifestOutput).toBe(null);
      expect(opts.ssr.input).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(opts.ssr.renderInput).toBe(resolve(cwd, 'src', 'entry.ssr.tsx'));
      expect(opts.ssr.outDir).toBe(resolve(cwd, 'server'));
      expect(opts.ssr.manifestInput).toBe(null);
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
      expect(opts.entryStrategy).toEqual({ type: 'smart' });
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
      expect(opts.client.input).toEqual([resolve(cwd, 'src', 'components', 'app', 'app.tsx')]);
      expect(opts.client.outDir).toBe(resolve(cwd, 'dist'));
      expect(opts.client.manifestOutput).toBe(null);
      expect(opts.ssr.input).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(opts.ssr.renderInput).toBe(resolve(cwd, 'src', 'entry.ssr.tsx'));
      expect(opts.ssr.outDir).toBe(resolve(cwd, 'server'));
      expect(opts.ssr.manifestInput).toBe(null);
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
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
      expect(opts.client.input).toEqual([resolve(cwd, 'src', 'components', 'app', 'app.tsx')]);
      expect(opts.client.outDir).toBe(resolve(cwd, 'dist'));
      expect(opts.client.manifestOutput).toBe(null);
      expect(opts.ssr.input).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(opts.ssr.renderInput).toBe(resolve(cwd, 'src', 'entry.ssr.tsx'));
      expect(opts.ssr.outDir).toBe(resolve(cwd, 'server'));
      expect(opts.ssr.manifestInput).toBe(null);
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
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

    it('client input string', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ client: { input: 'src/cmps/main.tsx' } });
      expect(opts.client.input).toEqual([resolve(cwd, 'src', 'cmps', 'main.tsx')]);
    });

    it('client input array', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({
        client: { input: ['src/cmps/a.tsx', 'src/cmps/b.tsx'] },
      });
      expect(opts.client.input).toEqual([
        resolve(cwd, 'src', 'cmps', 'a.tsx'),
        resolve(cwd, 'src', 'cmps', 'b.tsx'),
      ]);
    });

    it('client outDir', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ client: { outDir: 'client-out' } });
      expect(opts.client.outDir).toBe(resolve(cwd, 'client-out'));
    });

    it('ssr outDir', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ ssr: { outDir: 'server-out' } });
      expect(opts.ssr.outDir).toBe(resolve(cwd, 'server-out'));
    });

    it('ssr renderInput', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ ssr: { renderInput: 'render.ssr.tsx' } });
      expect(opts.ssr.renderInput).toBe(resolve(cwd, 'render.ssr.tsx'));
      expect(opts.ssr.input).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
    });

    it('client manifestOutput', async () => {
      const plugin = mockPlugin();
      const manifestOutput = () => {};
      const opts = await plugin.normalizeOptions({ client: { manifestOutput } });
      expect(opts.client.manifestOutput).toBe(manifestOutput);
    });

    it('ssr manifestInput', async () => {
      const plugin = mockPlugin();
      const manifestInput: QwikManifest = { mapping: {}, symbols: {}, bundles: {}, version: '1' };
      const opts = await plugin.normalizeOptions({ ssr: { manifestInput } });
      expect(opts.ssr.manifestInput).toBe(manifestInput);
    });
  });

  function mockPlugin() {
    return createPlugin({
      sys: {
        cwd: () => process.cwd(),
        env: 'node',
        os: process.platform,
        dynamicImport: async (path) => require(path),
        path: require('path'),
      },
      binding: { mockBinding: true },
    });
  }
});
