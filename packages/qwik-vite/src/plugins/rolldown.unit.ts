import path, { resolve } from 'node:path';
import { qwikRolldown } from './rolldown';
import type { Rolldown } from 'vite';
import type { OptimizerOptions } from '../types';
import { createQwikPlugin, type NormalizedQwikPluginOptions } from './plugin';
import { assert, expect, test, vi } from 'vitest';
import { normalizePath } from '../../../qwik/src/testing/util';

const cwd = process.cwd();

function mockOptimizerOptions(): OptimizerOptions {
  return {
    sys: {
      cwd: () => process.cwd(),
      env: 'node',
      os: process.platform,
      dynamicImport: async (path) => import(path),
      strictDynamicImport: async (path) => import(path),
      path: path as any,
    },
    binding: { mockBinding: true },
  };
}

test('rolldown default input options, client', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  };
  const plugin = qwikRolldown(initOpts);
  const rolldownInputOpts: Rolldown.InputOptions = await plugin.options!({});

  assert.deepEqual((rolldownInputOpts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'root')),
  ]);
});

test('rolldown default input options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRolldown(initOpts);
  const rolldownInputOpts: Rolldown.InputOptions = await plugin.options!({});
  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();

  assert.deepEqual(rolldownInputOpts.treeshake, undefined);
  assert.deepEqual((rolldownInputOpts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'entry.ssr')),
  ]);
  assert.deepEqual((opts.input as string[]).map(normalizePath), [
    normalizePath(resolve(cwd, 'src', 'entry.ssr')),
  ]);
});

test('rolldown default set input options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRolldown(initOpts);
  const input = normalizePath(resolve(cwd, 'src', 'my.ssr.tsx'));
  const rolldownInputOpts: Rolldown.InputOptions = await plugin.options!({
    input,
  });
  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(rolldownInputOpts.treeshake, undefined);
  assert.deepEqual(rolldownInputOpts.input, [input]);
  assert.deepEqual(opts.input, [input]);
});

test('rolldown default output options, client', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});
  const rolldownOutputOpts: Rolldown.OutputOptions = await plugin.outputOptions!({});

  assert.deepEqual(rolldownOutputOpts.dir, normalizePath(resolve(cwd, 'dist')));
  assert.deepEqual(rolldownOutputOpts.format, 'es');
});

test('rolldown default output options, ssr', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});
  const rolldownOutputOpts: Rolldown.OutputOptions = await plugin.outputOptions!({
    format: 'cjs',
  });

  assert.deepEqual(rolldownOutputOpts.dir, normalizePath(resolve(cwd, 'server')));
  assert.deepEqual(rolldownOutputOpts.exports, 'auto');
});

test('rolldown input, default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
  assert.deepEqual(opts.rootDir, normalizePath(cwd));
  assert.deepEqual(opts.srcDir, normalizePath(resolve(cwd, 'src')));
});

test('rolldown input, client default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'client',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'segment' });
});

test('rolldown input, client/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'client',
    buildMode: 'production',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'client');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'smart' });
});

test('rolldown input, ssr/development default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'development',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
});

test('rolldown input, ssr/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'production',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'production');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
});

test('rolldown input, lib/production default', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'lib',
    buildMode: 'production',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'lib');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'inline' });
});

test('rolldown input, forceFullBuild true', async () => {
  const initOpts = {
    optimizerOptions: mockOptimizerOptions(),
    target: 'ssr',
    buildMode: 'development',
  } as any;
  const plugin = qwikRolldown(initOpts);
  await plugin.options!({});

  const opts: NormalizedQwikPluginOptions = plugin.api.getOptions();
  assert.deepEqual(opts.target, 'ssr');
  assert.deepEqual(opts.buildMode, 'development');
  assert.deepEqual(opts.entryStrategy, { type: 'hoist' });
});

type CodeSplitting = Exclude<Rolldown.OutputOptions['codeSplitting'], boolean | undefined>;

async function clientCodeSplitting(output: Rolldown.OutputOptions) {
  const plugin = qwikRolldown({ optimizerOptions: mockOptimizerOptions() });
  await plugin.options!({});
  const outputOpts: Rolldown.OutputOptions = await plugin.outputOptions!(output);
  return outputOpts.codeSplitting as CodeSplitting;
}

test.each([undefined, { click123: 'manual_click', visible123: 'manual_visible' }])(
  'smart preserves lazy segment boundaries and manual groups (%s)',
  async (manual) => {
    const plugin = qwikRolldown({
      optimizerOptions: mockOptimizerOptions(),
      entryStrategy: { type: 'smart', manual },
    });
    await plugin.options!({});
    const output = (await plugin.outputOptions!({})) as Rolldown.OutputOptions;
    const groups = (output.codeSplitting as CodeSplitting).groups!;
    const name = groups[2].name as Rolldown.CodeSplittingNameFunction;
    const ctx = {
      getModuleInfo: () => ({
        meta: {
          segment: {
            hash: 'click123',
            ctxName: 'event$',
            ctxKind: 'function',
            entry: 'entry_render',
          },
        },
      }),
    } as any;
    assert.equal(name('/src/click.js', ctx), manual?.click123 ?? 'segment_click123');
    ctx.getModuleInfo = () => ({
      meta: { segment: { hash: 'visible123', ctxName: 'useVisibleTask$', entry: 'entry_render' } },
    });
    assert.equal(name('/src/visible.js', ctx), manual?.visible123 ?? 'segment_visible123');
    ctx.getModuleInfo = () => ({
      meta: { segment: { hash: 'read123', ctxName: '$', ctxKind: 'function', entry: null } },
    });
    assert.equal(name('/src/read.js', ctx), null);
  }
);

test('smart rendering never imports a future interaction library through bundler helpers', async () => {
  const plugin = qwikRolldown({
    optimizerOptions: mockOptimizerOptions(),
    entryStrategy: { type: 'smart' },
  });
  await plugin.options!({});
  const output = (await plugin.outputOptions!({})) as Rolldown.OutputOptions;
  const source: Record<string, string> = {
    main: `import('render').then(console.log); import('click').then(console.log);`,
    render: `export const value = 1; export const self = () => import('render');`,
    click: `export { default } from 'heavy-library';`,
    'heavy-library': `exports.feature = () => console.log('future interaction');`,
  };
  const { rolldown } = await import('rolldown');
  const build = await rolldown({
    input: 'main',
    preserveEntrySignatures: 'allow-extension',
    plugins: [
      {
        name: 'fixture',
        resolveId: (id) => (id in source ? id : null),
        load: (id) =>
          id in source
            ? {
                code: source[id],
                meta:
                  id === 'render' || id === 'click'
                    ? {
                        segment: {
                          hash: id,
                          ctxName: id === 'render' ? 'component$' : 'event$',
                          entry: id === 'render' ? 'entry_render' : null,
                        },
                      }
                    : {},
              }
            : null,
      },
    ],
  });
  try {
    const { output: chunks } = await build.generate({
      format: 'es',
      codeSplitting: output.codeSplitting,
    });
    const byName = new Map(
      chunks.filter((chunk) => chunk.type === 'chunk').map((chunk) => [chunk.fileName, chunk])
    );
    const render = [...byName.values()].find((chunk) => 'render' in chunk.modules)!;
    const visited = new Set<string>();
    const visit = (name: string) => {
      if (visited.has(name)) {
        return;
      }
      visited.add(name);
      const chunk = byName.get(name)!;
      expect(Object.keys(chunk.modules)).not.toContain('heavy-library');
      chunk.imports.forEach(visit);
    };
    visit(render.fileName);
  } finally {
    await build.close();
  }
});

test.each(
  [
    { tsOptimizer: true, minify: false },
    { tsOptimizer: false, minify: false },
    { tsOptimizer: true, minify: true },
    { tsOptimizer: false, minify: true },
  ].flatMap((options) =>
    (['smart', 'component'] as const).flatMap((strategy) =>
      (['native', 'win32'] as const).map((pathStyle) => ({ ...options, strategy, pathStyle }))
    )
  )
)(
  '$strategy separates client-only code ($tsOptimizer, $minify, $pathStyle)',
  async ({ tsOptimizer, minify, strategy, pathStyle }) => {
    const fixturePath = pathStyle === 'win32' ? path.win32 : path;
    const rootDir = normalizePath(resolve(cwd, 'fixture'));
    const srcDir = `${rootDir}/src`;
    const clientFeatureId = `${srcDir}/client-feature`;
    const plugin = createQwikPlugin({ tsOptimizer });
    await plugin.init();
    await plugin.normalizeOptions({
      target: 'client',
      buildMode: 'production',
      entryStrategy: { type: strategy },
      rootDir,
      srcDir,
    });
    const parent = `${srcDir}/app.tsx`;
    const transformed = await plugin.transform(
      { addWatchFile() {}, emitFile() {} } as any,
      strategy === 'component'
        ? `import { $, component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';
     import { clientFeature } from './client-feature';
     export const App = component$(() => {
       const state = useSignal(0);
       const read = $(() => state.value);
       read();
       useVisibleTask$(() => clientFeature(state.value));
       return <div>{state.value}</div>;
     });`
        : `import { $, component$, event$, useTask$, useVisibleTask$ as visible } from '@qwik.dev/core';
     import { clientFeature } from './client-feature';
     function useCustomHook() {
       const value = 1;
       useTask$(() => console.log('shared', value));
       visible(() => clientFeature(value));
       return event$(() => clientFeature(value));
     }
     export const App = component$(() => {
       const value = 1;
       const read = $(() => value);
       read();
       const click = useCustomHook();
       return <>
         <button onClick$={click}>ready</button>
         <button onClick$={() => clientFeature(value)}>inline</button>
       </>;
     });`,
      parent
    );
    const modules = new Map<string, any>([[parent, transformed]]);
    for (const id of transformed!.meta!.qwikdeps) {
      modules.set(id, await plugin.load({} as any, id));
    }
    const { rolldown } = await import('rolldown');
    const build = await rolldown({
      input: [...modules.keys()],
      external: (id) => id.startsWith('@qwik.dev/'),
      preserveEntrySignatures: 'allow-extension',
      plugins: [
        {
          name: 'custom-hook-fixture',
          resolveId(id, importer) {
            const resolved = normalizePath(
              id.startsWith('.') ? fixturePath.resolve(fixturePath.dirname(importer!), id) : id
            );
            if (modules.has(resolved)) {
              return resolved;
            }
            if (resolved === clientFeatureId) {
              return resolved;
            }
            return null;
          },
          load(id) {
            if (id === clientFeatureId) {
              return 'exports.clientFeature = () => "CLIENT_ONLY_HEAVY";';
            }
            return modules.get(id);
          },
        },
      ],
    });
    try {
      const { output } = await build.generate({
        format: 'es',
        minify,
        codeSplitting: { ...plugin.codeSplitting(), includeDependenciesRecursively: false },
      });
      const chunks = output.filter((chunk) => chunk.type === 'chunk');
      const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
      const componentId = [...modules].find(
        ([, output]) => output?.meta?.segment?.ctxName === 'component$'
      )![0];
      const render = chunks.find((chunk) => componentId in chunk.modules)!;
      const readId = [...modules].find(([, output]) => output?.meta?.segment?.ctxName === '$')![0];
      expect(readId in render.modules).toBe(true);
      const visited = new Set<string>();
      const visit = (file: string) => {
        if (visited.has(file)) {
          return;
        }
        visited.add(file);
        const chunk = byName.get(file);
        if (!chunk) {
          return;
        }
        expect(Object.keys(chunk.modules)).not.toContain(clientFeatureId);
        chunk.imports.forEach(visit);
      };
      visit(render.fileName);
      expect(chunks.some((chunk) => chunk.code.includes('CLIENT_ONLY_HEAVY'))).toBe(true);
    } finally {
      await build.close();
    }
  }
);

test('codeSplitting starts with the qwik groups and disables dependency recursion', async () => {
  const codeSplitting = await clientCodeSplitting({});

  assert.deepEqual(codeSplitting.includeDependenciesRecursively, false);
  assert.deepEqual(
    codeSplitting.groups!.map((group) => group.name),
    ['qwik-core', 'qwik-preloader', codeSplitting.groups![2].name]
  );
  assert.deepEqual(typeof codeSplitting.groups![2].name, 'function');
  assert.deepEqual(
    codeSplitting.groups!.map((group) => group.includeDependenciesRecursively),
    [false, false, false]
  );
});

test('codeSplitting appends the user groups after the qwik groups', async () => {
  const vendor = { name: 'vendor', test: /node_modules/ };
  const codeSplitting = await clientCodeSplitting({ codeSplitting: { groups: [vendor] } });

  assert.deepEqual(codeSplitting.groups!.length, 4);
  assert.deepEqual(codeSplitting.groups![3], vendor);
});

test('codeSplitting keeps the user top-level options without touching the qwik groups', async () => {
  const codeSplitting = await clientCodeSplitting({
    codeSplitting: { includeDependenciesRecursively: true, minSize: 20000 },
  });

  assert.deepEqual(codeSplitting.includeDependenciesRecursively, true);
  assert.deepEqual(codeSplitting.minSize, 20000);
  assert.deepEqual(
    codeSplitting.groups!.map((group) => group.includeDependenciesRecursively),
    [false, false, false]
  );
});

test('codeSplitting true is the default and keeps the qwik groups', async () => {
  const codeSplitting = await clientCodeSplitting({ codeSplitting: true });

  assert.deepEqual(codeSplitting.groups!.length, 3);
});

test('codeSplitting false throws', async () => {
  await expect(clientCodeSplitting({ codeSplitting: false })).rejects.toThrow(/lazy loading/);
});

test('warns that manualChunks and advancedChunks are ignored', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  await clientCodeSplitting({ manualChunks: () => null });
  await clientCodeSplitting({ advancedChunks: { groups: [] } });
  await clientCodeSplitting({});

  assert.deepEqual(warn.mock.calls.length, 2);
  assert.match(warn.mock.calls[0][0], /codeSplitting\.groups/);
  warn.mockRestore();
});
