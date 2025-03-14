import path, { resolve } from 'node:path';
import { assert, describe, expect, test } from 'vitest';
import type { QwikManifest } from '../types';
import { ExperimentalFeatures, createQwikPlugin } from './plugin';
import { normalizePath } from '../../../testing/util';
import { qwikVite } from './vite';

const cwd = process.cwd();

test('types', () => () => {
  qwikVite({ csr: true });
  qwikVite({ csr: false, ssr: {} });
});

test('defaults', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
  assert.deepEqual(opts.input, [normalizePath(resolve(cwd, 'src', 'root'))]);
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
  assert.deepEqual(opts.input, [normalizePath(resolve(cwd, 'src', 'root'))]);
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
  assert.deepEqual(opts.input, [normalizePath(resolve(cwd, 'src', 'entry.ssr'))]);
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
  assert.deepEqual(opts.input, [normalizePath(resolve(cwd, 'src', 'entry.ssr'))]);
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(opts.manifestInput, null);
  assert.deepEqual(opts.manifestOutput, null);
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
  assert.deepEqual(opts.srcInputs, null);
});

test('debug true', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ debug: true });
  assert.deepEqual(opts.debug, true);
});

test('csr', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ csr: true });
  assert.deepEqual(opts.outDir, '');
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

test('entryStrategy, segment no forceFullBuild', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({ entryStrategy: { type: 'segment' } });
  assert.deepEqual(opts.entryStrategy.type, 'segment');
});

test('entryStrategy, segment and srcInputs', async () => {
  const plugin = await mockPlugin();
  const opts = plugin.normalizeOptions({
    entryStrategy: { type: 'segment' },
    srcInputs: [],
  });
  assert.deepEqual(opts.entryStrategy.type, 'segment');
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

test('experimental[]', async () => {
  const plugin = await mockPlugin();
  const flag = Object.values(ExperimentalFeatures)[0];
  if (!flag) {
    // we can't test this without a flag
    return;
  }
  const opts = plugin.normalizeOptions({ experimental: [flag] });
  assert.deepEqual(opts.experimental, { [flag]: true } as any);
});

describe('resolveId', () => {
  test('qrls', async () => {
    const plugin = await mockPlugin();
    expect(await plugin.resolveId(null!, 'foo', undefined)).toBeFalsy();
    const ctx = { resolve: async () => ({ id: 'Yey' }) } as any;
    await expect(
      plugin.resolveId(
        ctx,
        '/root/src/routes/layout.tsx_layout_component_usetask_1_7xk04rim0vu.js',
        undefined
      )
    ).resolves.toHaveProperty(
      'id',
      '/root/src/routes/layout.tsx_layout_component_usetask_1_7xk04rim0vu.js'
    );
    expect(
      await plugin.resolveId(ctx, '/root/src/routes/layout.tsx_s_7xk04rim0vu.js', undefined)
    ).toHaveProperty('id', '/root/src/routes/layout.tsx_s_7xk04rim0vu.js');
    expect(await plugin.resolveId(null!, './foo', '/root/src/routes/layout.tsx')).toBeFalsy();
    expect(
      await plugin.resolveId(
        ctx,
        './layout.tsx_layout_component_usetask_1_7xk04rim0vu.js',
        '/root/src/routes/layout.tsx'
      )
    ).toHaveProperty('id', '/root/src/routes/layout.tsx_layout_component_usetask_1_7xk04rim0vu.js');
    // this uses the already populated id we created above
    expect(
      await plugin.resolveId(
        {
          resolve: (id: string, importer: string) => {
            expect(id).toBe('/root/src/routes/foo');
            expect(importer).toBe('Yey');
            return { id: 'hi' };
          },
        } as any,
        './foo',
        '/root/src/routes/layout.tsx_layout_component_usetask_1_7xk04rim0vu.js'
      )
    ).toEqual({ id: 'hi' });
  });
  test('win32', async () => {
    const plugin = await mockPlugin('win32');
    expect(
      await plugin.resolveId(
        {
          resolve: async () => ({
            id: 'Yey',
          }),
        } as any,
        'C:\\src\\routes\\layout.tsx_s_7xk04rim0vu.js',
        undefined
      )
    ).toHaveProperty('id', 'C:/src/routes/layout.tsx_s_7xk04rim0vu.js');
  });
  test('libs', async () => {
    const plugin = await mockPlugin();
    expect(await plugin.resolveId(null!, '@builder.io/qwik/build', undefined)).toHaveProperty(
      'id',
      '@builder.io/qwik/build'
    );
    expect(await plugin.resolveId(null!, '/@builder.io/qwik/build', undefined)).toHaveProperty(
      'id',
      '@builder.io/qwik/build'
    );
    expect(await plugin.resolveId(null!, '@qwik-client-manifest', '/foo/bar')).toHaveProperty(
      'id',
      '@qwik-client-manifest'
    );
  });
});

async function mockPlugin(os = process.platform) {
  const plugin = createQwikPlugin({
    sys: {
      cwd: () => process.cwd(),
      env: 'node',
      os,
      dynamicImport: async (path) => import(path),
      strictDynamicImport: async (path) => import(path),
      path: path as any,
    },
    binding: { mockBinding: true },
  });
  await plugin.init();
  return plugin;
}
