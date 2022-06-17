import { resolve } from 'path';
import { qwikRollup, QwikRollupPluginOptions } from './rollup';
import type { InputOptions, OutputOptions } from 'rollup';
import type { OptimizerOptions } from '../types';
import type { NormalizedQwikPluginOptions } from './plugin';

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
    expect(rollupInputOpts.input).toEqual([resolve(cwd, 'src', 'root.tsx')]);
  });

  it('rollup default input options, ssr', async () => {
    initOpts.target = 'ssr';
    const plugin = qwikRollup(initOpts);
    const rollupInputOpts: InputOptions = await plugin.options!({});
    const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();

    expect(typeof rollupInputOpts.onwarn).toBe('function');
    expect(rollupInputOpts.treeshake).toBe(false);
    expect(rollupInputOpts.input).toEqual([resolve(cwd, 'src', 'entry.ssr.tsx')]);
    expect(opts.input).toEqual([resolve(cwd, 'src', 'entry.ssr.tsx')]);
  });

  it('rollup default set input options, ssr', async () => {
    initOpts.target = 'ssr';
    const plugin = qwikRollup(initOpts);
    const rollupInputOpts: InputOptions = await plugin.options!({
      input: resolve(cwd, 'src', 'my.ssr.tsx'),
    });
    const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();

    expect(typeof rollupInputOpts.onwarn).toBe('function');
    expect(rollupInputOpts.treeshake).toBe(false);
    expect(rollupInputOpts.input).toEqual(resolve(cwd, 'src', 'my.ssr.tsx'));
    expect(opts.input).toEqual([resolve(cwd, 'src', 'my.ssr.tsx')]);
  });

  it('rollup default output options, client', async () => {
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});
    const rollupOutputOpts: OutputOptions = await plugin.outputOptions!({});

    expect(rollupOutputOpts.dir).toEqual(resolve(cwd, 'dist'));
    expect(rollupOutputOpts.format).toEqual('es');
  });

  it('rollup default output options, ssr', async () => {
    initOpts.target = 'ssr';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});
    const rollupOutputOpts: OutputOptions = await plugin.outputOptions!({
      format: 'cjs',
    });

    expect(rollupOutputOpts.dir).toEqual(resolve(cwd, 'server'));
    expect(rollupOutputOpts.exports).toEqual('auto');
  });

  it('rollup input, default', async () => {
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
    expect(opts.target).toBe('client');
    expect(opts.buildMode).toBe('development');
    expect(opts.entryStrategy).toEqual({ type: 'hook' });
    expect(opts.forceFullBuild).toEqual(true);
    expect(opts.rootDir).toEqual(cwd);
    expect(opts.srcDir).toEqual(resolve(cwd, 'src'));
  });

  it('rollup input, client default', async () => {
    initOpts.target = 'client';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
    expect(opts.target).toBe('client');
    expect(opts.buildMode).toBe('development');
    expect(opts.entryStrategy).toEqual({ type: 'hook' });
    expect(opts.forceFullBuild).toEqual(true);
  });

  it('rollup input, client/production default', async () => {
    initOpts.target = 'client';
    initOpts.buildMode = 'production';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
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

    const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
    expect(opts.target).toBe('ssr');
    expect(opts.buildMode).toBe('development');
    expect(opts.entryStrategy).toEqual({ type: 'inline' });
    expect(opts.forceFullBuild).toEqual(true);
  });

  it('rollup input, ssr/production default', async () => {
    initOpts.target = 'ssr';
    initOpts.buildMode = 'production';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
    expect(opts.target).toBe('ssr');
    expect(opts.buildMode).toBe('production');
    expect(opts.entryStrategy).toEqual({ type: 'inline' });
    expect(opts.forceFullBuild).toEqual(true);
  });

  it('rollup input, lib/production default', async () => {
    initOpts.target = 'lib';
    initOpts.buildMode = 'production';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
    expect(opts.target).toBe('lib');
    expect(opts.buildMode).toBe('development');
    expect(opts.entryStrategy).toEqual({ type: 'inline' });
    expect(opts.forceFullBuild).toEqual(true);
  });

  it('rollup input, forceFullBuild true', async () => {
    initOpts.forceFullBuild = true;
    initOpts.target = 'ssr';
    initOpts.buildMode = 'development';
    const plugin = qwikRollup(initOpts);
    await plugin.options!({});

    const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
    expect(opts.target).toBe('ssr');
    expect(opts.buildMode).toBe('development');
    expect(opts.entryStrategy).toEqual({ type: 'inline' });
    expect(opts.forceFullBuild).toEqual(true);
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
