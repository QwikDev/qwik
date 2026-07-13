import path, { resolve } from 'node:path';
import { assert, describe, expect, test } from 'vitest';
import { normalizePath } from '../../../qwik/src/testing/util';
import type { QwikManifest } from '../types';
import { ExperimentalFeatures, createQwikPlugin } from './plugin';
import { isServerOnlyModule } from './server-only-modules';
import { qwikVite } from './vite';
import type { ResolvedId } from 'rollup';

const cwd = process.cwd();

test('types', () => () => {
  qwikVite({ csr: true });
  qwikVite({ csr: false, ssr: {} });
});

test('defaults', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
  assert.deepEqual((opts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'root')),
  ]);
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(opts.manifestInput, null);
  assert.deepEqual(opts.manifestOutput, null);
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
});

test('defaults (buildMode: production)', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ buildMode: 'production' });
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
  assert.deepEqual(opts.resolveQwikBuild, true);
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
  assert.deepEqual((opts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'root')),
  ]);
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(opts.manifestInput, null);
  assert.deepEqual(opts.manifestOutput, null);
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
});

test('defaults (target: ssr)', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ target: 'ssr' });
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
  assert.deepEqual(opts.resolveQwikBuild, true);
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
  assert.deepEqual((opts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'entry.ssr')),
  ]);
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(opts.manifestInput, null);
  assert.deepEqual(opts.manifestOutput, null);
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
});

test('defaults (buildMode: production, target: ssr)', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ buildMode: 'production', target: 'ssr' });
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
  assert.deepEqual(opts.resolveQwikBuild, true);
  assert.deepEqual(opts.debug, false);
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
  assert.deepEqual((opts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'entry.ssr')),
  ]);
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(opts.manifestInput, null);
  assert.deepEqual(opts.manifestOutput, null);
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
});

test('debug true', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ debug: true });
  assert.deepEqual(opts.debug, true);
});

test('csr', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ csr: true });
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'dist')));
});

test('override entryStrategy', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({
    entryStrategy: { type: 'component' },
    buildMode: 'production',
  });
  assert.deepEqual(opts.entryStrategy.type, 'component');
});

test('entryStrategy, smart', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({
    entryStrategy: { type: 'smart' },
  });
  assert.deepEqual(opts.entryStrategy.type, 'smart');
});

test('entryStrategy, segment no forceFullBuild', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ entryStrategy: { type: 'segment' } });
  assert.deepEqual(opts.entryStrategy.type, 'segment');
});

test('entryStrategy, segment and srcInputs', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({
    entryStrategy: { type: 'segment' },
  });
  assert.deepEqual(opts.entryStrategy.type, 'segment');
});

test('rootDir, abs path', async () => {
  const plugin = await mockPlugin();
  const customRoot = normalizePath(resolve(cwd, 'abs-path'));
  const opts = await plugin.normalizeOptions({ rootDir: customRoot });
  assert.deepEqual(opts.rootDir, customRoot);
});

test('rootDir, rel path', async () => {
  const plugin = await mockPlugin();
  const customRoot = 'rel-path';
  const opts = await plugin.normalizeOptions({ rootDir: customRoot });
  assert.deepEqual(opts.rootDir, normalizePath(resolve(cwd, customRoot)));
});

test('tsconfigFileNames', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({
    tsconfigFileNames: ['./tsconfig.json', './tsconfig.app.json'],
  });
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json', './tsconfig.app.json']);
});

test('tsconfigFileNames, empty array fallback to default', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({
    tsconfigFileNames: [],
  });
  assert.deepEqual(opts.tsconfigFileNames, ['./tsconfig.json']);
});

test('input string', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ input: 'src/cmps/main.tsx' });
  // we don't provide input so that we don't override the vite input
  assert.deepEqual(opts.input, undefined);
});

test('input array', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({
    input: ['src/cmps/a.tsx', 'src/cmps/b.tsx'],
  });
  // we don't provide input so that we don't override the vite input
  assert.deepEqual(opts.input, undefined);
});

test('outDir', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ outDir: 'out' });
  assert.deepEqual(opts.outDir, normalizePath(resolve(cwd, 'out')));
});

test('manifestOutput', async () => {
  const plugin = await mockPlugin();
  const manifestOutput = () => {};
  const opts = await plugin.normalizeOptions({ manifestOutput });
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
  const opts = await plugin.normalizeOptions({ manifestInput });
  assert.deepEqual(opts.manifestInput, manifestInput);
});

test('resolveQwikBuild true', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ resolveQwikBuild: true });
  assert.deepEqual(opts.resolveQwikBuild, true);
});

test('resolveQwikBuild false', async () => {
  const plugin = await mockPlugin();
  const opts = await plugin.normalizeOptions({ resolveQwikBuild: false });
  assert.deepEqual(opts.resolveQwikBuild, false);
});

test('experimental[]', async () => {
  const plugin = await mockPlugin();
  const flag = Object.values(ExperimentalFeatures)[0];
  if (!flag) {
    // we can't test this without a flag
    return;
  }
  const opts = await plugin.normalizeOptions({ experimental: [flag] });
  assert.deepEqual(opts.experimental, { [flag]: true } as any);
});

describe('server-only module detection', () => {
  test('detects absolute and root-relative src/server module paths', () => {
    const opts = {
      rootDir: '/repo/app',
      srcDir: '/repo/app/src',
    };

    expect(isServerOnlyModule('/repo/app/src/server/db.ts', opts)).toBe(true);
    expect(isServerOnlyModule('/src/server/db.ts', opts)).toBe(true);
    expect(isServerOnlyModule('/repo/app/src/routes/admin/server/session.ts', opts)).toBe(true);
    expect(isServerOnlyModule('/src/server-functions.ts', opts)).toBe(false);
    expect(isServerOnlyModule('@qwik.dev/core/server', opts)).toBe(false);
  });

  test('does not rewrite unrelated posix absolute paths as root-relative dev urls', () => {
    expect(
      isServerOnlyModule('/other/app/src/server/db.ts', {
        rootDir: '/repo/app',
        srcDir: '/repo/app/src',
      })
    ).toBe(false);
  });

  test('detects windows src/server module paths', () => {
    expect(
      isServerOnlyModule('C:\\repo\\app\\src\\server\\db.ts', {
        rootDir: 'C:\\repo\\app',
        srcDir: 'C:\\repo\\app\\src',
      })
    ).toBe(true);
  });
});

describe('resolveId', () => {
  test('qrls', async () => {
    const plugin = await mockPlugin();
    expect(await plugin.resolveId({} as any, 'foo', undefined)).toBeFalsy();
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
    expect(await plugin.resolveId({} as any, './foo', '/root/src/routes/layout.tsx')).toBeFalsy();
    expect(
      (
        (await plugin.resolveId(
          ctx,
          './layout.tsx_layout_component_usetask_1_7xk04rim0vu.js',
          '/root/src/routes/layout.tsx'
        )) as ResolvedId
      ).id
    ).toContain('/root/src/routes/layout.tsx_layout_component_usetask_1_7xk04rim0vu.js');
    // this uses the already populated id we created above
    expect(
      await plugin.resolveId(
        {
          resolve: (id: string, importer: string) => {
            expect(id).toContain(
              process.platform === 'win32' ? '\\root\\src\\routes\\foo' : '/root/src/routes/foo'
            );
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
    expect(await plugin.resolveId({} as any, '@qwik.dev/core/build', undefined)).toHaveProperty(
      'id',
      '@qwik.dev/core/build'
    );
    expect(await plugin.resolveId({} as any, '/@qwik.dev/core/build', undefined)).toHaveProperty(
      'id',
      '@qwik.dev/core/build'
    );
    expect(
      await plugin.resolveId({} as any, '@qwik-client-manifest', '/foo/bar/core')
    ).toHaveProperty('id', '@qwik-client-manifest');
  });
  test('rejects server-only modules from the client graph', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'client',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    const srcDir = normalizePath(resolve(cwd, 'src'));
    const importer = `${srcDir}/entry.client.tsx`;

    await expect(plugin.resolveId({} as any, `${srcDir}/db.server.ts`, importer)).rejects.toThrow(
      /Server-only module cannot be imported by client code/
    );
    await expect(
      plugin.resolveId({} as any, `${srcDir}/db.server.ts?raw`, importer)
    ).rejects.toThrow(/Server-only module cannot be imported by client code/);
    await expect(plugin.resolveId({} as any, `${srcDir}/server/db.ts`, importer)).rejects.toThrow(
      /Server-only module cannot be imported by client code/
    );
    await expect(plugin.resolveId({} as any, `/src/server/db.ts`, importer)).rejects.toThrow(
      /Server-only module cannot be imported by client code/
    );
    await expect(
      plugin.resolveId({} as any, `${srcDir}/routes/admin/server/session.ts`, importer)
    ).rejects.toThrow(/Server-only module cannot be imported by client code/);
  });
  test('allows server-only imports stripped by isServer guards in client transforms', async () => {
    const plugin = await mockPlugin(process.platform, true);
    await plugin.normalizeOptions({
      target: 'client',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    const srcDir = normalizePath(resolve(cwd, 'src'));
    const importer = `${srcDir}/routes/index.ts`;
    const code = `
      import { isServer } from '@qwik.dev/core';

      export const secret = async () => {
        if (isServer) {
          const { readSecret } = await import('../server/db');
          return readSecret();
        }
        return undefined;
      };
    `;
    const ctx = {
      addWatchFile: () => {},
      parse: () => {
        throw new Error('client output still contains the server-only import');
      },
      resolve: async (id: string) => {
        throw new Error(`client output resolved unexpected import ${id}`);
      },
    };

    await expect(plugin.transform(ctx as any, code, importer)).resolves.toMatchObject({
      code: expect.not.stringContaining('../server/db'),
    });
  });
  test('allows non-server-only paths that contain server in the filename', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'client',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    const srcDir = normalizePath(resolve(cwd, 'src'));

    await expect(
      plugin.resolveId({} as any, `${srcDir}/server-functions.ts`, `${srcDir}/entry.client.tsx`)
    ).resolves.toBeFalsy();
    await expect(
      plugin.resolveId({} as any, '@qwik.dev/core/server', `${srcDir}/entry.client.tsx`)
    ).resolves.toBeFalsy();
  });
  test('allows server-only modules during vite dev dependency scanning', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'client',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    plugin.configureServer({ moduleGraph: { getModuleById: () => undefined } } as any);
    const srcDir = normalizePath(resolve(cwd, 'src'));

    await expect(
      plugin.resolveId({} as any, `${srcDir}/db.server.ts`, `${srcDir}/routes/index.tsx`, {
        scan: true,
      })
    ).resolves.toBeFalsy();
  });
  test('rejects server-only modules during vite dev resolution outside dependency scanning', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'client',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    plugin.configureServer({} as any);
    const srcDir = normalizePath(resolve(cwd, 'src'));

    await expect(
      plugin.resolveId({} as any, `${srcDir}/db.server.ts`, `${srcDir}/routes/index.tsx`)
    ).rejects.toThrow(/Server-only module cannot be imported by client code/);
  });
  test('rejects server-only modules during non-dev dependency scanning', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'client',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    const srcDir = normalizePath(resolve(cwd, 'src'));

    await expect(
      plugin.resolveId({} as any, `${srcDir}/db.server.ts`, `${srcDir}/routes/index.tsx`, {
        scan: true,
      })
    ).rejects.toThrow(/Server-only module cannot be imported by client code/);
  });
  test('allows server-only modules from the ssr graph', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'ssr',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    const srcDir = normalizePath(resolve(cwd, 'src'));

    await expect(
      plugin.resolveId({} as any, `${srcDir}/db.server.ts`, `${srcDir}/entry.ssr.tsx`)
    ).resolves.toBeFalsy();
    await expect(plugin.load({} as any, `${srcDir}/server/db.ts`)).resolves.toBeFalsy();
    await expect(
      plugin.transform({} as any, 'export const value = 1;', `${srcDir}/db.server.ts_symbol.js`)
    ).resolves.toBeFalsy();
  });
  test('allows server-only modules from vite server environments', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'client',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    const srcDir = normalizePath(resolve(cwd, 'src'));
    const serverCtx = { environment: { config: { consumer: 'server' } } } as any;

    await expect(
      plugin.resolveId(serverCtx, `${srcDir}/db.server.ts`, `${srcDir}/entry.ssr.tsx`)
    ).resolves.toBeFalsy();
  });
  test('rejects server-only modules from vite client environments during ssr dev mode', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'ssr',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    plugin.configureServer({ moduleGraph: { getModuleById: () => undefined } } as any);
    const srcDir = normalizePath(resolve(cwd, 'src'));
    const clientCtx = { environment: { config: { consumer: 'client' } } } as any;

    await expect(
      plugin.resolveId(clientCtx, `${srcDir}/db.server.ts`, `${srcDir}/routes/index.tsx`)
    ).rejects.toThrow(/Server-only module cannot be imported by client code/);
  });
  test('allows server-only modules during lib builds', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'lib',
      rootDir: cwd,
      srcDir: resolve(cwd, 'src'),
    });
    const srcDir = normalizePath(resolve(cwd, 'src'));

    await expect(
      plugin.resolveId({} as any, `${srcDir}/db.server.ts`, `${srcDir}/entry.tsx`)
    ).resolves.toBeFalsy();
  });
  test('rejects windows server-only paths from the client graph', async () => {
    const plugin = await mockPlugin('win32');
    await plugin.normalizeOptions({ target: 'client' });

    await expect(
      plugin.resolveId({} as any, 'C:\\project\\src\\db.server.ts', 'C:\\project\\src\\app.tsx')
    ).rejects.toThrow('C:/project/src/db.server.ts');
  });
});

test('transform exposes SSR imports restored after client-only stripping as qwik deps', async () => {
  const plugin = await mockPlugin(process.platform, true);
  await plugin.normalizeOptions({
    target: 'ssr',
    rootDir: '/root',
    srcDir: '/root/src',
  });

  const result = await plugin.transform(
    {
      addWatchFile: () => undefined,
      emitFile: () => undefined,
      parse: parseImportsOnly,
      resolve: async (id: string) => {
        if (id === '@qwik.dev/core' || id === '@qwik.dev/core/jsx-runtime') {
          return { id: `/root/node_modules/${id}/index.mjs` };
        }
        if (id === '@example/server-fn') {
          return { id: '/root/libs/server-fn.ts' };
        }
      },
    } as any,
    `import { component$, useVisibleTask$ } from '@qwik.dev/core';
import { callServer } from '@example/server-fn';

export default component$(() => {
  useVisibleTask$(() => {
    callServer();
  });
  return <span>ready</span>;
});
`,
    '/root/src/routes/index.tsx'
  );

  expect(result?.code).not.toContain('import "@example/server-fn";');
  expect(result?.meta?.qwikdeps).toContain('/root/libs/server-fn.ts');
});

test('load skips HMR wrapper for worker$ segments', async () => {
  const plugin = await mockPlugin(process.platform, true);
  await plugin.normalizeOptions({ rootDir: '/root' });
  plugin.configureServer({
    hot: {},
    moduleGraph: {
      getModuleById: () => undefined,
      invalidateModule: () => undefined,
    },
  } as any);

  const result = await plugin.transform(
    {
      addWatchFile: () => undefined,
      emitFile: () => undefined,
    } as any,
    `import { worker$ } from '@qwik.dev/core/worker';
export const runInWorker = worker$(() => 'hello');
`,
    '/root/src/routes/index.tsx'
  );

  const deps = result?.meta?.qwikdeps;
  expect(deps).toHaveLength(1);

  const segmentId = deps![0];
  const loaded = await plugin.load({} as any, segmentId);
  expect((loaded as { code: string }).code).not.toContain(
    "document.dispatchEvent(new CustomEvent('qHmr'"
  );
  expect((loaded as { code: string }).code).not.toContain("typeof document !== 'undefined'");
});

test('load preserves worker chunk markers inside event segments', async () => {
  const plugin = await mockPlugin(process.platform, true);
  await plugin.normalizeOptions({ rootDir: '/root' });
  plugin.configureServer({
    hot: {},
    moduleGraph: {
      getModuleById: () => undefined,
      invalidateModule: () => undefined,
    },
  } as any);

  const result = await plugin.transform(
    {
      addWatchFile: () => undefined,
      emitFile: () => undefined,
    } as any,
    `import { component$, useSignal } from '@qwik.dev/core';
import { worker$ } from '@qwik.dev/core/worker';

const incrementInWorker = worker$((count: number) => count + 1);

export default component$(() => {
  const count = useSignal(0);

  return (
    <button
      onClick$={async () => {
        count.value = await incrementInWorker(count.value);
      }}
    >
      Increment
    </button>
  );
});
`,
    '/root/src/routes/index.tsx'
  );

  const deps = result?.meta?.qwikdeps;
  expect(deps?.length).toBeGreaterThan(0);

  const eventSegmentId = deps!.find((dep: any) => dep.includes('_q_e_click_'));
  expect(eventSegmentId).toBeTruthy();

  const loaded = await plugin.load({} as any, eventSegmentId!);
  const code = (loaded as { code: string }).code;
  expect(code).toContain('_qrlWithChunkDEV(');
  const workerQrlSentinel = '"__QWIK' + '_WORKER_QRL__:';
  expect(code.includes(workerQrlSentinel) || code.includes('?worker_file&type=module')).toBe(true);
});

test('load wraps non-worker QRL segment HMR with a runtime document guard', async () => {
  const plugin = await mockPlugin(process.platform, true);
  await plugin.normalizeOptions({ rootDir: '/root' });
  plugin.configureServer({
    hot: {},
    moduleGraph: {
      getModuleById: () => undefined,
      invalidateModule: () => undefined,
    },
  } as any);

  const result = await plugin.transform(
    {
      addWatchFile: () => undefined,
      emitFile: () => undefined,
    } as any,
    `import { component$ } from '@qwik.dev/core';
export default component$(() => <button onClick$={() => 'hello'}>hi</button>);
`,
    '/root/src/routes/index.tsx'
  );

  const deps = result?.meta?.qwikdeps;
  expect(deps?.length).toBeGreaterThan(0);

  const eventSegmentId = deps!.find((dep: any) => dep.includes('_q_e_click_'));
  expect(eventSegmentId).toBeTruthy();

  const loaded = await plugin.load({} as any, eventSegmentId!);
  expect((loaded as { code: string }).code).toContain(
    "if (import.meta.hot && typeof document !== 'undefined')"
  );
});

test('transform omits sourcemaps for public virtual modules', async () => {
  const plugin = await mockPlugin(process.platform, true);
  await plugin.normalizeOptions({ rootDir: '/root', srcDir: '/root/src' });

  const result = await plugin.transform(
    {
      addWatchFile: () => undefined,
      emitFile: () => undefined,
    } as any,
    `export default p => <svg {...p} viewBox="0 0 1 1" />;`,
    'virtual:/root/src/components/favicon.svg.qwik.jsx'
  );

  expect(result).toBeTruthy();
  expect(result!.code).toContain('_jsxSplit');
  expect(result!.map).toBeNull();
});

async function mockPlugin(os = process.platform, useRealOptimizer = false) {
  const plugin = createQwikPlugin({
    sys: {
      cwd: () => process.cwd(),
      env: 'node',
      os,
      dynamicImport: async (path) => import(path),
      strictDynamicImport: async (path) => import(path),
      path: path as any,
    },
    ...(useRealOptimizer ? {} : { binding: { mockBinding: true } }),
  });
  await plugin.init();
  return plugin;
}

function parseImportsOnly(code: string) {
  const body = Array.from(
    code.matchAll(/(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)
  ).map(([, value]) => ({
    type: 'ImportDeclaration',
    importKind: 'value',
    source: { value },
  }));
  return { type: 'Program', body };
}

describe('transform: globalThis.__QWIK_MANIFEST__ replacement', () => {
  const sampleManifest: QwikManifest = {
    manifestHash: 'abc123',
    mapping: { symbol_abc: 'chunk.js' },
    symbols: {},
    bundles: {},
    version: '1',
  };

  test('replaces !globalThis.__QWIK_MANIFEST__ with false when no manifest is available', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({ target: 'ssr', buildMode: 'development' });

    const code = `if (!globalThis.__QWIK_MANIFEST__) { throw new Error('no manifest'); }`;
    const result = await plugin.transform({} as any, code, '/root/src/server.js');

    expect(result).toBeTruthy();
    expect(result!.code).toContain('false');
    expect(result!.code).not.toContain('!globalThis.__QWIK_MANIFEST__');
  });

  test('replaces globalThis.__QWIK_MANIFEST__ with manifest JSON when manifest is available', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'ssr',
      buildMode: 'development',
      manifestInput: sampleManifest,
    });

    const code = `const m = globalThis.__QWIK_MANIFEST__;`;
    const result = await plugin.transform({} as any, code, '/root/src/server.js');

    expect(result).toBeTruthy();
    expect(result!.code).not.toContain('globalThis.__QWIK_MANIFEST__');
    expect(result!.code).toContain('"manifestHash":"abc123"');
  });

  test('generates a fresh sourcemap after manifest replacement', async () => {
    const plugin = await mockPlugin();
    await plugin.normalizeOptions({
      target: 'ssr',
      buildMode: 'development',
      manifestInput: sampleManifest,
    });

    const code = `const m = globalThis.__QWIK_MANIFEST__;`;
    const result = await plugin.transform({} as any, code, '/root/src/server.js');

    expect(result).toBeTruthy();
    expect(result!.map).toBeTruthy();
  });
});
