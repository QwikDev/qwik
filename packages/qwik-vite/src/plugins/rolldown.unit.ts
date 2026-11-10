import path, { resolve } from 'node:path';
import {
  normalizeRolldownOutputObject,
  qwikRolldown,
  type QwikRolldownPluginOptions,
} from './rolldown';
import type { Rolldown } from 'vite';
import type { OptimizerOptions, SegmentAnalysis } from '../types';
import { createQwikPlugin, type NormalizedQwikPluginOptions } from './plugin';
import { assert, describe, expect, test, vi } from 'vitest';
import { normalizePath } from '../../../qwik/src/testing/util';
import { flattenToChunkName, shortenChunkName } from './vite-utils';

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
            canonicalFilename: 'app.tsx_App_component_click_click123',
            ctxName: 'event$',
            ctxKind: 'function',
            entry: 'entry_render',
          },
        },
      }),
    } as any;
    assert.equal(
      name('/src/click.js', ctx),
      manual?.click123 ?? 'app.tsx_App_component_click_click123'
    );
    ctx.getModuleInfo = () => ({
      meta: {
        segment: {
          hash: 'visible123',
          canonicalFilename: 'app.tsx_App_component_useVisibleTask_visible123',
          ctxName: 'useVisibleTask$',
          entry: 'entry_render',
        },
      },
    });
    assert.equal(
      name('/src/visible.js', ctx),
      manual?.visible123 ?? 'app.tsx_App_component_useVisibleTask_visible123'
    );
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
                          canonicalFilename: `app.tsx_App_component_${id}`,
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

async function buildSmartDebugClient(
  tsOptimizer: boolean,
  sources: Record<string, string>,
  inputs = Object.keys(sources)
) {
  const debugLog = vi.spyOn(console, 'debug').mockImplementation(() => {});
  const srcDir = normalizePath(resolve(cwd, 'fixture', 'src'));
  const plugin = createQwikPlugin({ tsOptimizer });
  await plugin.init();
  await plugin.normalizeOptions({
    target: 'client',
    buildMode: 'production',
    debug: true,
    entryStrategy: { type: 'smart' },
    rootDir: path.dirname(srcDir),
    srcDir,
  });
  const files = new Map(Object.entries(sources).map(([file, code]) => [`${srcDir}/${file}`, code]));
  const segments = new Map<string, SegmentAnalysis>();
  const { rolldown } = await import('rolldown');
  const build = await rolldown({
    input: inputs.map((file) => `${srcDir}/${file}`),
    external: (id) => id.startsWith('@qwik.dev/'),
    preserveEntrySignatures: 'allow-extension',
    plugins: [
      {
        name: 'qwik-fixture',
        resolveId: (id, importer) => {
          if (!importer) {
            return id;
          }
          return id.startsWith('.')
            ? normalizePath(path.resolve(path.dirname(importer), id))
            : null;
        },
        async load(id) {
          if (files.has(id)) {
            return files.get(id);
          }
          const segment = await plugin.load(this as any, id);
          segments.set(id, segment!.meta!.segment);
          return segment;
        },
        transform(code, id) {
          return files.has(id) ? plugin.transform(this as any, code, id) : null;
        },
      },
    ],
  });
  try {
    const { output } = await build.generate(normalizeRolldownOutputObject(plugin, {}));
    const chunks = output.filter((chunk) => chunk.type === 'chunk');
    const segmentChunks = [...segments].map(([id, segment]) => ({
      segment,
      fileName: chunks.find((chunk) => id in chunk.modules)?.fileName,
    }));
    return { chunks, segmentChunks };
  } finally {
    await build.close();
    debugLog.mockRestore();
  }
}

async function readableChunkFileNames(
  options: Pick<QwikRolldownPluginOptions, 'buildMode' | 'debug'>
) {
  const plugin = qwikRolldown({ optimizerOptions: mockOptimizerOptions(), ...options });
  await plugin.options!({});
  const output: Rolldown.OutputOptions = await plugin.outputOptions!({});
  return output.chunkFileNames as (chunk: Rolldown.PreRenderedChunk) => string;
}

describe('debug chunk names', () => {
  test.each([true, false])(
    'names each separated smart chunk after its segment (tsOptimizer: %s)',
    async (tsOptimizer) => {
      const { segmentChunks } = await buildSmartDebugClient(tsOptimizer, {
        'app.tsx': `import { $, component$, event$, useSignal, useVisibleTask$ } from '@qwik.dev/core';
         export const App = component$(() => {
           const count = useSignal(0);
           const reset = $(() => (count.value = 0));
           const log = event$(() => console.log(count.value));
           useVisibleTask$(() => console.log(count.value));
           return <>
             <button onClick$={() => count.value++}>increment</button>
             <button onClick$={reset}>reset</button>
             <button onClick$={log}>log</button>
           </>;
         });`,
      });
      const separated = segmentChunks.filter(({ segment }) => segment.ctxName !== 'component$');

      expect(separated.map(({ segment }) => segment.ctxName).sort()).toEqual([
        '$',
        'event$',
        'onClick$',
        'useVisibleTask$',
      ]);
      expect(separated.map(({ fileName }) => fileName)).toEqual(
        separated.map(({ segment }) => `build/${segment.canonicalFilename}.js`)
      );
    }
  );

  test.each([true, false])(
    'gives every separated handler its own chunk when names repeat (tsOptimizer: %s)',
    async (tsOptimizer) => {
      const page = `import { component$ } from '@qwik.dev/core';
       export const Page = component$(() => <>
         <button onClick$={() => console.log('one')}>one</button>
         <button onClick$={() => console.log('two')}>two</button>
       </>);`;
      const { segmentChunks } = await buildSmartDebugClient(tsOptimizer, {
        'a/page.tsx': page,
        'b/page.tsx': page,
      });
      const handlers = segmentChunks.filter(({ segment }) => segment.ctxName === 'onClick$');

      expect(handlers).toHaveLength(4);
      expect(new Set(handlers.map(({ segment }) => segment.displayName)).size).toBe(2);
      expect(new Set(handlers.map(({ fileName }) => fileName)).size).toBe(4);
    }
  );

  test.each([true, false])(
    'shortens the chunk name of a deeply nested handler (tsOptimizer: %s)',
    async (tsOptimizer) => {
      const { segmentChunks } = await buildSmartDebugClient(tsOptimizer, {
        'app.tsx': `import { component$ } from '@qwik.dev/core';
         export const App = component$(() =>
           ${'<div>'.repeat(60)}<button onClick$={() => console.log('deep')} />${'</div>'.repeat(60)}
         );`,
      });
      const { segment, fileName } = segmentChunks.find(
        ({ segment }) => segment.ctxName === 'onClick$'
      )!;

      expect(Buffer.byteLength(segment.canonicalFilename)).toBeGreaterThan(200);
      expect(fileName).toBe(`build/${shortenChunkName(segment.canonicalFilename)}.js`);
      expect(fileName).toMatch(new RegExp(`_${segment.hash}\\.js$`));
    }
  );

  test.each([true, false])(
    'keeps the handler name when its entry chunk also holds a dependency (tsOptimizer: %s)',
    async (tsOptimizer) => {
      const { chunks, segmentChunks } = await buildSmartDebugClient(
        tsOptimizer,
        {
          'root.tsx': `export const load = () => import('./routes/page.tsx');`,
          'routes/page.tsx': `import { component$ } from '@qwik.dev/core';
           import { confetti } from './confetti';
           export const Page = component$(() => <button onClick$={() => confetti()}>go</button>);`,
          'routes/confetti': `export const confetti = () => console.log('CONFETTI');`,
        },
        ['root.tsx']
      );
      const { segment, fileName } = segmentChunks.find(
        ({ segment }) => segment.ctxName === 'onClick$'
      )!;
      const entry = chunks.find(
        (chunk) => chunk.fileName === `build/${segment.canonicalFilename}-entry.js`
      );

      expect(fileName).toBe(`build/${segment.canonicalFilename}.js`);
      expect(Object.keys(entry!.modules).map((id) => path.basename(id))).toEqual(['confetti']);
    }
  );

  test('adds -entry to an entry chunk whose module lives in another chunk', async () => {
    const chunkFileNames = await readableChunkFileNames({ buildMode: 'production', debug: true });
    const name = 'app.tsx_App_component_button_q_e_click_abc123';
    const facadeModuleId = `/src/${name}.js`;

    expect(chunkFileNames({ name, facadeModuleId, moduleIds: ['/src/confetti.ts'] } as any)).toBe(
      `build/${name}-entry.js`
    );
    expect(chunkFileNames({ name, facadeModuleId, moduleIds: [facadeModuleId] } as any)).toBe(
      `build/${name}.js`
    );
  });

  test.each([
    { buildMode: 'production', debug: true },
    { buildMode: 'development', debug: false },
  ] as const)('shortens long chunk file names ($buildMode, debug: $debug)', async (options) => {
    const chunkFileNames = await readableChunkFileNames(options);
    const name = `app.tsx_App_component_${'div_'.repeat(60)}button_q_e_click_ppvuTaDoEGk`;

    expect(chunkFileNames({ name, moduleIds: [] } as any)).toBe(
      `build/${shortenChunkName(name)}.js`
    );
  });

  test('flattens, then shortens, long path-like chunk names', async () => {
    const chunkFileNames = await readableChunkFileNames({ buildMode: 'production', debug: true });
    const relativeName = `node_modules/.pnpm/${'@scope+lib@1.0.0_'.repeat(10)}/node_modules/@scope/lib/index.qwik.mjs_entry_Widget`;
    const fileName = chunkFileNames({ name: resolve(cwd, relativeName), moduleIds: [] } as any);

    expect(fileName).toBe(`build/${shortenChunkName(flattenToChunkName(relativeName))}.js`);
    expect(fileName.slice('build/'.length)).not.toContain('/');
  });
});

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

test('the qwik-core group takes the whole runtime, including its per-module production build', async () => {
  const codeSplitting = await clientCodeSplitting({});
  const core = codeSplitting.groups![0].test as RegExp;

  assert.isTrue(core.test('/app/node_modules/@qwik.dev/core/dist/core.prod.mjs'));
  assert.isTrue(core.test('/app/node_modules/@qwik.dev/core/dist/core/prod/runtime/owner.mjs'));
  assert.isTrue(core.test('/repo/packages/qwik/dist/core/prod/shared/qrl/qrl.mjs'));
  assert.isTrue(core.test('/repo/packages/qwik/dist/core-chunk-QSSRPNEK.mjs'));
  assert.isTrue(core.test('/repo/packages/qwik/dist/async-local-storage.mjs'));
  assert.isTrue(
    core.test('C:\\repo\\node_modules\\@qwik.dev\\core\\dist\\async-local-storage.mjs')
  );
  assert.isFalse(core.test('/app/src/core/dist/components/core.tsx'));
  assert.isFalse(core.test('/app/node_modules/@qwik.dev/core/dist/preloader.mjs'));
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
