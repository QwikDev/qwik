import { resolve } from 'path';
import type { OptimizerOptions } from '../types';
import { createPlugin } from './plugin';

describe('qwik plugin', () => {
  const cwd = process.cwd();

  describe('normalizeOptions', () => {
    it('defaults', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions();
      expect(opts.debug).toBe(false);
      expect(opts.isDevBuild).toBe(false);
      expect(opts.buildMode).toBe('client');
      expect(opts.rootDir).toBe(cwd);
      expect(opts.outClientDir).toBe(resolve(cwd, 'dist'));
      expect(opts.outServerDir).toBe(resolve(cwd, 'server'));
      expect(opts.srcDir).toBe(resolve(cwd, 'src'));
      expect(opts.srcInputs).toBe(null);
      expect(opts.srcRootInput).toEqual([resolve(cwd, 'src', 'root.tsx')]);
      expect(opts.srcEntryServerInput).toBe(resolve(cwd, 'src', 'entry.server.tsx'));
      expect(opts.entryStrategy).toEqual({ type: 'single' });
      expect(opts.minify).toBe('minify');
      expect(opts.symbolsOutput).toBe(null);
    });

    it('debug true', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ debug: true });
      expect(opts.debug).toBe(true);
    });

    it('isDevBuild true', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ isDevBuild: true });
      expect(opts.isDevBuild).toBe(true);
      expect(opts.entryStrategy.type).toBe('hook');
      expect(opts.minify).toBe('none');
    });

    it('ssr build mode', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ buildMode: 'ssr' });
      expect(opts.buildMode).toBe('ssr');
    });

    it('entryStrategy', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ entryStrategy: { type: 'component' } });
      expect(opts.entryStrategy.type).toBe('component');
    });

    it('minify', async () => {
      const plugin = mockPlugin();
      const opts = await plugin.normalizeOptions({ minify: 'minify' });
      expect(opts.minify).toBe('minify');
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
