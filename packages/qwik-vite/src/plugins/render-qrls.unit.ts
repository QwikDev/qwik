import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { generateManifestFromBundles } from '../manifest';
import type { QwikBundleGraph, QwikManifest } from '../types';
import { convertManifestToBundleGraph } from './bundle-graph';
import { createQwikPlugin } from './plugin';

const fixtures = [
  {
    name: 'a child component control',
    workCode: `import { component$ } from '@qwik.dev/core';
      export const work = component$(() => 'ready');`,
    workContext: 'component$',
    component: `const Child = work; return <Child />;`,
    isRenderDependency: true,
  },
  {
    name: 'a local explicit QRL called during rendering',
    workOrigin: 'app.tsx',
    component: `const load = $(() => 'ready'); return <div>{await load()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'an imported explicit QRL called during rendering',
    component: `return <div>{await work()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a local custom hook calling an explicit QRL',
    setup: `function useValue() { return work(); }`,
    component: `return <div>{await useValue()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'an imported custom hook calling an explicit QRL',
    hook: `export function useValue() { return work(); }`,
    component: `return <div>{await useValue()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a QRL returned by a custom hook and called during rendering',
    hook: `export function useValue() { return work; }`,
    component: `const load = useValue(); return <div>{await load()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a custom hook forwarding a QRL to a helper that calls it',
    hook: `function read(load) { return load(); }
      export function useValue(load) { return read(load); }`,
    component: `return <div>{await useValue(work)}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'an explicit QRL called by a rendered computed value',
    component: `const value = useComputed$(() => work()); return <div>{value.value}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a QRL captured by a computed callback inside a custom hook',
    hook: `import { useComputed$ } from '@qwik.dev/core'; export function useValue(load) { return useComputed$(() => load()); }`,
    component: `const value = useValue(work); return <div>{value.value}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a local QRL invoked in a synchronous array callback',
    workOrigin: 'app.tsx',
    component: `return <div>{await Promise.all([1].map(async () => { const load = $(() => 'ready'); return load(); }))}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a custom hook forwarding QRLs through rest arguments',
    hook: `function read(...loads) { return loads[0](); } export function useValue(...loads) { return read(...loads); }`,
    component: `return <div>{await useValue(work)}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a custom hook imported through a namespace',
    setup: `import * as hooks from './hook';`,
    hook: `export function useValue() { return work(); }`,
    component: `return <div>{await hooks.useValue()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a reexported QRL called through a custom hook module',
    hook: `export { work as useValue } from './work';`,
    component: `return <div>{await useValue()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a QRL invoked with Function.call',
    component: `return <div>{await work.call(null)}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a QRL returned in an object by a custom hook',
    hook: `export function useValue() { return { load: work }; }`,
    component: `const { load } = useValue(); return <div>{await load()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a QRL called through a closure returned by a custom hook',
    hook: `export function useValue(load) { return () => load(); }`,
    component: `const load = useValue(work); return <div>{await load()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'a captured QRL called by a QRL returned from a custom hook',
    hook: `import { $ } from '@qwik.dev/core'; export function useValue(load) { return $(() => load()); }`,
    component: `const load = useValue(work); return <div>{await load()}</div>;`,
    isRenderDependency: true,
  },
  {
    name: 'an uncalled captured QRL beside an invoked ordinary callback',
    hook: `import { $ } from '@qwik.dev/core'; export function useValue(future, read) { return $(() => { read(); return future; }); }`,
    component: `const run = useValue(work, () => 'ready'); await run(); return <div>ready</div>;`,
    isRenderDependency: false,
  },
  {
    name: 'a captured QRL stored only in an event returned by a custom hook',
    hook: `import { $ } from '@qwik.dev/core'; export function useValue(load) { return $(() => load()); }`,
    component: `const click = useValue(work); return <button onClick$={click}>ready</button>;`,
    isRenderDependency: false,
  },
  {
    name: 'a QRL captured by a client-only task in a custom hook',
    hook: `import { useVisibleTask$ } from '@qwik.dev/core'; export function useValue(load) { useVisibleTask$(() => load()); }`,
    component: `useValue(work); return <div>ready</div>;`,
    isRenderDependency: false,
  },
  {
    name: 'a QRL registered as a future event by a custom hook',
    hook: `import { useOn } from '@qwik.dev/core'; export function useValue(load) { useOn('click', load); }`,
    component: `useValue(work); return <div>ready</div>;`,
    isRenderDependency: false,
  },
  {
    name: 'an unused custom hook export calling a QRL',
    hook: `export function unused() { return work(); } export function useValue() { return 'ready'; }`,
    component: `return <div>{useValue()}</div>;`,
    isRenderDependency: false,
  },
  {
    name: 'a shadowed QRL that is never called',
    component: `function read(work) { return work(); } return <div>{read(() => 'ready')}</div>;`,
    isRenderDependency: false,
  },
  {
    name: 'a QRL captured only by a deferred custom hook closure',
    hook: `export function useValue(load) { return () => load(); }`,
    component: `const click = useValue(work); return <button onClick$={() => click()}>ready</button>;`,
    isRenderDependency: false,
  },
  {
    name: 'a QRL returned by a custom hook and passed to an event',
    hook: `export function useValue() { return work; }`,
    component: `const click = useValue(); return <button onClick$={click}>ready</button>;`,
    isRenderDependency: false,
  },
  {
    name: 'an explicit QRL called only inside a future event handler',
    component: `return <button onClick$={async () => await work()}>ready</button>;`,
    isRenderDependency: false,
  },
];

const renderDependencies = (graph: QwikBundleGraph, root: string) => {
  const visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name)) {
      return;
    }
    visited.add(name);
    const start = graph.indexOf(name);
    expect(start).toBeGreaterThanOrEqual(0);
    let isRenderDependency = true;
    for (let i = start + 1; i < graph.length && typeof graph[i] === 'number'; i++) {
      const edge = graph[i] as number;
      if (edge < 0) {
        isRenderDependency = edge <= -11;
      } else if (isRenderDependency) {
        visit(graph[edge] as string);
      }
    }
  };
  visit(root);
  return visited;
};

const buildFixture = async (
  fixture: (typeof fixtures)[number],
  tsOptimizer: boolean,
  minify: boolean
) => {
  const plugin = createQwikPlugin({ tsOptimizer });
  await plugin.init();
  await plugin.normalizeOptions({
    rootDir: '/fixture',
    srcDir: '/fixture/src',
    target: 'client',
    buildMode: 'production',
    entryStrategy: { type: 'smart' },
  });
  const sources: Record<string, string> = {
    '/fixture/src/app.tsx': `import { $, component$, useComputed$, useVisibleTask$ } from '@qwik.dev/core';
      import { work } from './work';
      ${fixture.hook ? "import { useValue } from './hook';" : ''}
      ${fixture.setup || ''}
      export const App = component$(async () => { ${fixture.component} });`,
    '/fixture/src/work.ts':
      fixture.workCode ||
      `import { $ as lazy } from '@qwik.dev/core';
      export const work = lazy(() => 'ready');`,
    ...(fixture.hook
      ? { '/fixture/src/hook.ts': `import { work } from './work'; ${fixture.hook}` }
      : {}),
  };
  const modules = new Map<string, NonNullable<Awaited<ReturnType<typeof plugin.transform>>>>();
  for (const [id, source] of Object.entries(sources)) {
    const output = await plugin.transform({ addWatchFile() {}, emitFile() {} } as any, source, id);
    modules.set(id, output!);
    for (const dependency of output!.meta!.qwikdeps) {
      modules.set(dependency, (await plugin.load({} as any, dependency)) as any);
    }
  }
  const segments = [...modules.values()].flatMap((output) =>
    output.meta?.segment ? [output.meta.segment] : []
  );
  const render = segments.find((segment) => segment.ctxName === 'component$')!;
  const work = segments.find(
    (segment) =>
      segment.ctxName === (fixture.workContext || '$') &&
      segment.origin === (fixture.workOrigin || 'work.ts')
  )!;
  expect(render).toBeDefined();
  expect(work).toBeDefined();
  const { rolldown } = await import('rolldown');
  let manifest: QwikManifest | undefined;
  const build = await rolldown({
    input: [...modules.keys()],
    external: (id) => id.startsWith('@qwik.dev/'),
    preserveEntrySignatures: 'allow-extension',
    plugins: [
      {
        name: 'render-qrl-fixture',
        resolveId(id, importer) {
          const resolved = id.startsWith('.') ? path.resolve(path.dirname(importer!), id) : id;
          return [resolved, `${resolved}.ts`, `${resolved}.tsx`].find((id) => modules.has(id));
        },
        load(id) {
          return modules.get(id);
        },
        generateBundle(_, output) {
          manifest = Reflect.apply(generateManifestFromBundles, undefined, [
            path,
            segments,
            [],
            output,
            plugin.getOptions(),
            () => {},
            (name: string) => name,
            this.getModuleInfo.bind(this),
            undefined,
            undefined,
            undefined,
            this.parse.bind(this),
          ]);
        },
      },
    ],
  });
  try {
    await build.generate({ format: 'es', minify, codeSplitting: plugin.codeSplitting() });
    expect(manifest).toBeDefined();
    return { manifest: manifest!, render: render.name, work: work.name };
  } finally {
    await build.close();
  }
};

describe.each([
  [true, false],
  [false, false],
  [true, true],
  [false, true],
])('smart render QRL graph (tsOptimizer: %s, minify: %s)', (tsOptimizer, minify) => {
  test.each(fixtures)('$name', async (fixture) => {
    const { manifest, render, work } = await buildFixture(fixture, tsOptimizer, minify);
    const renderChunk = manifest.mapping[render];
    const workChunk = manifest.mapping[work];
    expect(renderChunk).toBeDefined();
    expect(workChunk).toBeDefined();
    expect(workChunk).not.toBe(renderChunk);
    const graph = convertManifestToBundleGraph(manifest);
    expect(graph).toContain(workChunk);
    expect(renderDependencies(graph, renderChunk).has(workChunk)).toBe(fixture.isRenderDependency);
  });
});
