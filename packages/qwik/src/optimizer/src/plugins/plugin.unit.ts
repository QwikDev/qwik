import path, { resolve } from 'node:path';
import { assert, test } from 'vitest';
import type { QwikManifest } from '../types';
import { createPlugin } from './plugin';
import { normalizePath } from '../../../testing/util';

const cwd = process.cwd();

test('defaults', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hook' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
  assert.deepEqual(opts.input, [normalizePath(resolve(cwd, 'src', 'root.tsx'))]);
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(opts.manifestInput, null);
  assert.deepEqual(opts.manifestOutput, null);
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
  assert.deepEqual(opts.srcInputs, null);
});

test('defaults (buildMode: production)', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ buildMode: 'production' });
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
  assert.deepEqual(opts.resolveQwikBuild, true);
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
  assert.deepEqual(opts.input, [normalizePath(resolve(cwd, 'src', 'root.tsx'))]);
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(opts.manifestInput, null);
  assert.deepEqual(opts.manifestOutput, null);
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
  assert.deepEqual(opts.srcInputs, null);
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
});

test('defaults (target: ssr)', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ target: 'ssr' });
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
  assert.deepEqual(opts.resolveQwikBuild, true);
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
  assert.deepEqual(opts.input, [normalizePath(resolve(cwd, 'src', 'entry.ssr.tsx'))]);
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(opts.manifestInput, null);
  assert.deepEqual(opts.manifestOutput, null);
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
  assert.deepEqual(opts.srcInputs, null);
});

test('defaults (buildMode: production, target: ssr)', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ buildMode: 'production', target: 'ssr' });
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
  assert.deepEqual(opts.resolveQwikBuild, true);
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
  assert.deepEqual(opts.input, [normalizePath(resolve(cwd, 'src', 'entry.ssr.tsx'))]);
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(opts.manifestInput, null);
  assert.deepEqual(opts.manifestOutput, null);
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
  assert.deepEqual(opts.srcInputs, null);
});

test('debug true', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ debug: false });
  assert.deepEqual(opts.debug, true);
});

test('override entryStrategy', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({
    entryStrategy: { type: 'component' },
    buildMode: 'production',
  });
  assert.deepEqual(opts.entryStrategy.type, 'component');
});

test('entryStrategy, smart', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({
    entryStrategy: { type: 'smart' },
  });
  assert.deepEqual(opts.entryStrategy.type, 'smart');
});

test('entryStrategy, hook no forceFullBuild', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ entryStrategy: { type: 'hook' } });
  assert.deepEqual(opts.entryStrategy.type, 'hook');
});

test('entryStrategy, hook and srcInputs', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({
    entryStrategy: { type: 'hook' },
    srcInputs: [],
  });
  assert.deepEqual(opts.entryStrategy.type, 'hook');
});

test('rootDir, abs path', async () => {
  const plugin = await mockPlugin();
  const customRoot = normalizePath(resolve(cwd, 'abs-path'));
  const opts = plugin.normalizeOptions({ rootDir: customRoot });
  assert.deepEqual(opts.rootDir, customRoot);
});

test('rootDir, rel path', async () => {
  const plugin = await mockPlugin();
  const customRoot = 'rel-path';
  const opts = plugin.normalizeOptions({ rootDir: customRoot });
  assert.deepEqual(opts.rootDir, normalizePath(resolve(cwd, customRoot)));
});

test('tsconfigFileNames', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({
    tsconfigFileNames: ['./tsconfig.json', './tsconfig.app.json'],
  });
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json', './tsconfig.app.json']);
});

test('tsconfigFileNames, empty array fallback to default', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({
    tsconfigFileNames: [],
  });
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
});

test('input string', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ input: 'src/cmps/main.tsx' });
  assert.deepEqual(opts.input, [normalizePath(resolve(cwd, 'src', 'cmps', 'main.tsx'))]);
});

test('input array', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({
    input: ['src/cmps/a.tsx', 'src/cmps/b.tsx'],
  });
  assert.deepEqual(opts.input, [
    normalizePath(resolve(cwd, 'src', 'cmps', 'a.tsx')),
    normalizePath(resolve(cwd, 'src', 'cmps', 'b.tsx')),
  ]);
});

test('outDir', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ outDir: 'out' });
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'out')));
});

test('manifestOutput', async () => {
  const plugin = await mockPlugin();
  const manifestOutput = () => {};
  const opts = plugin.normalizeOptions({ manifestOutput });
  assert.deepEqual(opts.manifestOutput, manifestOutput);
});

test('manifestInput', async () => {
  const plugin = await mockPlugin();
  const manifestInput: QwikManifest = {
    manifestHash: '',
    mapping: {},
    symbols: {},
    bundles: {},
    version: '1',
  };
  const opts = plugin.normalizeOptions({ manifestInput });
  assert.deepEqual(opts.manifestInput, manifestInput);
});

test('resolveQwikBuild true', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ resolveQwikBuild: true });
  assert.deepEqual(opts.resolveQwikBuild, true);
});

test('resolveQwikBuild false', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ resolveQwikBuild: false });
  assert.deepEqual(opts.resolveQwikBuild, false);
});

async function mockPlugin() {
  const plugin = createPlugin({
    sys: {
      cwd: () => process.cwd(),
      env: 'node',
      os: process.platform,
      dynamicImport: async (path) => import(path),
      strictDynamicImport: async (path) => import(path),
      path: path as any,
    },
    binding: { mockBinding: true },
  });
  await plugin.init();
  return plugin;
}
