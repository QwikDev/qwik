import { join } from 'path';
import { qwikRollup, QwikRollupPlugin, QwikRollupPluginOptions } from './rollup';
import type { InputOptions, OutputOptions } from 'rollup';
import type { OptimizerOptions } from '../types';
import type { NormalizedQwikPluginConfig } from './plugin';

describe('rollup  plugin', () => {
  const cwd = process.cwd();
  let initOpts: QwikRollupPluginOptions = {};

  beforeEach(() => {
    initOpts = {
      optimizerOptions: mockOptimizerOptions(),
    };
  });

  it('rollup default input options, client', async () => {
    const plugin = qwikRollup(initOpts);
    const rollupInputOpts: InputOptions = await plugin.options!({});

    expect(typeof rollupInputOpts.onwarn).toBe('function');
    expect(rollupInputOpts.input).toEqual([join(cwd, 'src', 'root.tsx')]);
  });

  it('rollup default input options, ssr', async () => {
    initOpts.target = 'ssr';
    const plugin = qwikRollup(initOpts);
    const rollupInputOpts: InputOptions = await plugin.options!({});

    expect(typeof rollupInputOpts.onwarn).toBe('function');
    expect(rollupInputOpts.treeshake).toBe(false);
    expect(rollupInputOpts.input).toEqual(join(cwd, 'src', 'entry.server.tsx'));
  });

  it('rollup default output options, client', async () => {
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});
    const rollupOutputOpts: OutputOptions = await plugin.outputOptions!({});

    expect(rollupOutputOpts.dir).toEqual(join(cwd, 'dist'));
    expect(rollupOutputOpts.format).toEqual('es');
  });

  it('rollup default output options, ssr', async () => {
    initOpts.target = 'ssr';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});
    const rollupOutputOpts: OutputOptions = await plugin.outputOptions!({});

    expect(rollupOutputOpts.dir).toEqual(join(cwd, 'server'));
    expect(rollupOutputOpts.format).toEqual('cjs');
    expect(rollupOutputOpts.exports).toEqual('auto');
  });

  it('rollup input, default', async () => {
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginConfig = plugin.api.getOptions();
    expect(opts.target).toBe('client');
    expect(opts.buildMode).toBe('development');
    expect(opts.entryStrategy).toEqual({ type: 'hook' });
    expect(opts.forceFullBuild).toEqual(false);
  });

  it('rollup input, client default', async () => {
    initOpts.target = 'client';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginConfig = plugin.api.getOptions();
    expect(opts.target).toBe('client');
    expect(opts.buildMode).toBe('development');
    expect(opts.entryStrategy).toEqual({ type: 'hook' });
    expect(opts.forceFullBuild).toEqual(false);
  });

  it('rollup input, client/production default', async () => {
    initOpts.target = 'client';
    initOpts.buildMode = 'production';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginConfig = plugin.api.getOptions();
    expect(opts.target).toBe('client');
    expect(opts.buildMode).toBe('production');
    expect(opts.entryStrategy).toEqual({ type: 'smart' });
    expect(opts.forceFullBuild).toEqual(true);
  });

  it('rollup input, ssr/development default', async () => {
    initOpts.target = 'ssr';
    initOpts.buildMode = 'development';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginConfig = plugin.api.getOptions();
    expect(opts.target).toBe('ssr');
    expect(opts.buildMode).toBe('development');
    expect(opts.entryStrategy).toEqual({ type: 'hook' });
    expect(opts.forceFullBuild).toEqual(false);
  });

  it('rollup input, ssr/production default', async () => {
    initOpts.target = 'ssr';
    initOpts.buildMode = 'production';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginConfig = plugin.api.getOptions();
    expect(opts.target).toBe('ssr');
    expect(opts.buildMode).toBe('production');
    expect(opts.entryStrategy).toEqual({ type: 'smart' });
    expect(opts.forceFullBuild).toEqual(true);
  });

  it('rollup input, forceFullBuild true', async () => {
    initOpts.forceFullBuild = true;
    initOpts.target = 'ssr';
    initOpts.buildMode = 'development';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginConfig = plugin.api.getOptions();
    expect(opts.target).toBe('ssr');
    expect(opts.buildMode).toBe('development');
    expect(opts.entryStrategy).toEqual({ type: 'hook' });
    expect(opts.forceFullBuild).toEqual(true);
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
