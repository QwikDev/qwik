import { expect, test } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { createLibraryPlan, readLibraryPlan } from '../library-plan';
import { EntryKind, MODULE_PLAN_VERSION, LinkResultKind } from '../schema';
import { deepFreeze, serverSpecialization } from './fixtures';
import { linkPlans, ResolutionKind, SideEffects } from '../link/link-plans';

test('publishes immutable neutral library plans with portable module IDs', async () => {
  const module = await analyseModule(
    { path: '/build/library.tsx', code: 'export const Label = p => <p>{p.value}</p>;' },
    {}
  );
  const source = JSON.stringify(module);
  const plan = createLibraryPlan(
    deepFreeze([module]),
    [{ kind: EntryKind.Module, module: module.path }],
    { edges: {} }
  );
  expect(JSON.stringify(module)).toBe(source);
  const restored = readLibraryPlan(JSON.stringify(plan));
  expect(restored.modules[0].path).toBe('module-0.tsx');
  expect(restored.modules[0].bindings.some((binding) => binding.result !== undefined)).toBe(true);
  expect(restored.modules[0].version).toBe(MODULE_PLAN_VERSION);
});

test('keeps linked content QRL identity across library relocation and compilation scopes', async () => {
  const names: string[] = [];
  for (const scope of ['first', 'second']) {
    const module = await analyseModule(
      {
        path: 'library.tsx',
        code: `import { useSignal } from '@qwik.dev/core';
      export default () => { const value = useSignal(external()); return <p>{value.value}</p>; };`,
      },
      { scope }
    );
    const library = createLibraryPlan([module], [{ kind: EntryKind.Module, module: module.path }], {
      edges: {},
    });
    const symbols: string[] = [];
    for (const plan of [module, library.modules[0]]) {
      const linked = linkPlans(
        [plan],
        [{ kind: EntryKind.Module, module: plan.path }],
        serverSpecialization(),
        {
          edges: {
            [plan.path]: Object.fromEntries(
              plan.edges.map((edge) => [edge.id, { r: ResolutionKind.External }])
            ),
          },
        },
        { claims: [], policies: [], emissions: [] },
        true
      );
      if (linked.kind !== LinkResultKind.Linked) {
        throw new Error(JSON.stringify(linked));
      }
      symbols.push(linked.plan.modules[0].qrls.find((qrl) => qrl.ctxName === 'content')!.name);
    }
    expect(symbols[1]).toBe(symbols[0]);
    names.push(symbols[0]);
  }
  expect(names[0]).not.toBe(names[1]);
});

test.each([
  { format: 'qwik/library-plan', version: 999, modules: [], entries: [], resolver: { edges: {} } },
  {
    format: 'qwik/library-plan',
    version: 1,
    modules: [{ format: 'qwik/module-plan', version: 999, path: 'module-0.tsx' }],
    entries: [],
    resolver: { edges: {} },
  },
  {
    format: 'qwik/library-plan',
    version: 1,
    modules: [{ format: 'qwik/module-plan', version: MODULE_PLAN_VERSION, path: '../source.tsx' }],
    entries: [],
    resolver: { edges: {} },
  },
])('rejects incompatible or nonportable plans', (plan) => {
  expect(() => readLibraryPlan(JSON.stringify(plan))).toThrow(/Unsupported Qwik/);
});

test.each(['entry', 'edge', 'owner', 'duplicate'] as const)(
  'rejects invalid %s module references',
  async (invalid) => {
    const module = await analyseModule(
      { path: 'library.tsx', code: 'export default () => <p />;' },
      {}
    );
    const plan = createLibraryPlan([module], [{ kind: EntryKind.Module, module: module.path }], {
      edges: {},
    });
    if (invalid === 'entry') {
      plan.entries[0].module = '../outside.tsx';
    }
    if (invalid === 'edge') {
      plan.resolver.edges['module-0.tsx'] = {
        import: {
          r: ResolutionKind.Resolved,
          path: '../outside.tsx',
          sideEffects: SideEffects.Unknown,
        },
      };
    }
    if (invalid === 'owner') {
      plan.resolver.edges['../outside.tsx'] = {};
    }
    if (invalid === 'duplicate') {
      plan.modules.push(plan.modules[0]);
    }
    expect(() => readLibraryPlan(JSON.stringify(plan))).toThrow(/Unsupported Qwik/);
  }
);

test.each(['version', 'source', 'binding', 'offset'] as const)(
  'rejects invalid declared type %s metadata',
  async (invalid) => {
    const module = await analyseModule(
      {
        path: 'library.tsx',
        code: 'export default (props: {value: string}) => <p>{props.value}</p>;',
      },
      { transpileTs: true }
    );
    const artifact = createLibraryPlan(
      [module],
      [{ kind: EntryKind.Module, module: module.path }],
      { edges: {} }
    );
    const plan = JSON.parse(JSON.stringify(artifact));
    const source = plan.modules[0].source;
    if (invalid === 'version') {
      plan.modules[0].version = 2;
    }
    if (invalid === 'source') {
      source.types.code = null;
    }
    if (invalid === 'binding') {
      source.types.bindings[0].binding = 99999;
    }
    if (invalid === 'offset') {
      source.types.bindings[0].start = -1;
    }
    expect(() => readLibraryPlan(JSON.stringify(plan))).toThrow(/Unsupported Qwik/);
  }
);

test('resolves generic imported contracts after library relocation', async () => {
  const modules = await Promise.all(
    [
      {
        path: 'library.tsx',
        code: 'import type {Input} from "./types"; export default (props: Input) => <p>{props.value}</p>;',
      },
      { path: 'types.ts', code: 'interface Box<T> {value: T} export type Input = Box<string>;' },
    ].map((source) => analyseModule(source, { transpileTs: true }))
  );
  const before = JSON.stringify(modules);
  const artifact = readLibraryPlan(
    JSON.stringify(
      createLibraryPlan(
        deepFreeze(modules),
        [{ kind: EntryKind.Export, module: 'library.tsx', export: 'default' }],
        {
          edges: {
            'library.tsx': {
              0: { r: ResolutionKind.Resolved, path: 'types.ts', sideEffects: SideEffects.Free },
            },
          },
        }
      )
    )
  );
  const linked = linkPlans(
    deepFreeze(artifact.modules),
    artifact.entries,
    serverSpecialization(),
    artifact.resolver,
    { claims: [], policies: [], emissions: [] },
    true
  );
  expect(linked.kind).toBe(LinkResultKind.Linked);
  if (linked.kind !== LinkResultKind.Linked) {
    throw new Error(JSON.stringify(linked));
  }
  expect(linked.plan.modules[0].programs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        body: expect.objectContaining({
          ops: expect.arrayContaining([
            expect.objectContaining({
              children: [expect.objectContaining({ op: 'hole', shape: 'text' })],
            }),
          ]),
        }),
      }),
    ])
  );
  expect(JSON.stringify(modules)).toBe(before);
});
