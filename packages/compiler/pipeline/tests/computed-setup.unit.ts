import { expect, test } from 'vitest';
import { analyseModule, linkPlans } from '../index';
import {
  BoundaryKind,
  InvokeKind,
  LinkResultKind,
  OpKind,
  ProgramBodyKind,
  SetupKind,
  ValueKind,
  EntryKind,
  ArgKind,
} from '../schema';
import { deepFreeze, serverSpecialization, loadDefaultFunction } from './fixtures';
import { UnsupportedError } from '../errors';
import { transformModules } from '../compat/transform-modules';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled as renderToString } from '../../../qwik/src/server/ssr-render';
import type { ComputedQrl } from '../../../qwik/src/core/reactive/computed-qrl';

test('generated computed setup tracks dependencies, caches and renders escaped SSR text', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    transpileTs: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { useSignal, useComputed$ } from '@qwik.dev/core';
export default () => {
  const count = useSignal(1);
  const doubled = useComputed$(() => count.value * 2);
  const label = useComputed$(function () { return '<value:' + doubled.value + '>'; });
  return <span>{label.value}</span>;
};`,
      },
    ],
  });
  const computeds: ComputedQrl<unknown>[] = [];
  const signals: core.Signal<number>[] = [];
  const reads = [0, 0];
  const component = output.modules.find((module) => !module.segment)!;
  const render = loadDefaultFunction(component, {
    ...core,
    get _captures() {
      return core._captures;
    },
    useSignal(initial: number) {
      const signal = core.useSignal(initial);
      signals.push(signal);
      return signal;
    },
    useComputedQrl: (...args: Parameters<typeof core.useComputedQrl>) => {
      const index = computeds.length;
      const original = args[0].resolved!;
      args[0].s((ctx) => {
        reads[index]++;
        return original(ctx);
      });
      const computed = core.useComputedQrl(...args);
      computeds.push(computed);
      return computed;
    },
  });
  const owner = core.createOwner(null);
  try {
    core.runWithOwner(owner, render, undefined, { nextId: () => 0, addRoot: () => 0 });
    expect(computeds).toHaveLength(2);
    expect(reads).toEqual([1, 1]);
    expect(computeds[1].value).toBe('<value:2>');
    expect(reads).toEqual([1, 1]);
    signals[0].value = 4;
    expect(computeds[1].value).toBe('<value:8>');
    expect(reads).toEqual([2, 2]);
  } finally {
    core.disposeOwner(owner);
  }
  const result = await renderToString(
    loadDefaultFunction(component, {
      ...core,
      get _captures() {
        return core._captures;
      },
    })
  );
  expect(result.html).toContain('&lt;value:2&gt;</span>');
});

test('computed setup uses existing invocation and signal-read plans', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `import { useSignal, useComputed$ as computed } from '@qwik.dev/core';
export default () => {
  const count = useSignal(1);
  const doubled = computed(() => count.value * 2);
  return <span>{doubled.value}</span>;
};`,
    },
    {}
  );
  const program = plan.programs.find((program) => program.setup.length > 0)!;
  expect(program.setup.map((entry) => entry.s === SetupKind.Invoke && entry.invoke.op)).toEqual([
    InvokeKind.UseSignal,
    InvokeKind.UseComputed,
  ]);
  const callback = plan.qrls.find((qrl) => qrl.ctxName === 'useComputed$')!;
  expect(callback.boundary).toEqual({ kind: BoundaryKind.Implicit, role: 'hook' });
  expect(callback.captures.map((capture) => plan.bindings[capture.binding].name)).toEqual([
    'count',
  ]);
  expect(program.setup[1]).toMatchObject({
    s: SetupKind.Invoke,
    invoke: { op: InvokeKind.UseComputed, qrl: { a: ArgKind.Qrl, use: { qrl: callback.id } } },
  });
  expect(program.body).toMatchObject({
    kind: ProgramBodyKind.Ops,
    ops: [{ op: OpKind.Element, children: [{ op: OpKind.Hole, value: { v: ValueKind.Read } }] }],
  });
  const restored = JSON.parse(JSON.stringify(plan));
  const linked = linkPlans(
    deepFreeze([restored]),
    [{ kind: EntryKind.Module, module: plan.path }],
    serverSpecialization(),
    { edges: {} },
    { claims: [], policies: [], emissions: [] },
    true
  );
  expect(linked.kind).toBe(LinkResultKind.Linked);
  expect(plan).toEqual(restored);
});

test.each([
  'useComputed$()',
  'useComputed$(callback)',
  'useComputed$(...callbacks)',
  'useComputed$(() => 1, { initial: 0 })',
  'useComputed$(async () => 1)',
])('deferred computed forms remain unsupported: %s', async (initializer) => {
  await expect(
    analyseModule(
      {
        path: 'component.tsx',
        code: `import { useComputed$ } from '@qwik.dev/core';
export default () => { const result = ${initializer}; return <span>{result.value}</span>; };`,
      },
      {}
    )
  ).rejects.toThrow(UnsupportedError);
});

test.each([false, true])(
  'a capture-free computed keeps a single callback (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      transpileTs: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useComputed$ } from '@qwik.dev/core';
export default () => {
  const answer = useComputed$(() => 42);
  return <span>{answer.value}</span>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const chunks = output.modules.filter((module) => module.segment);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].segment!.captures).toBe(false);
    const component = output.modules.find((module) => !module.segment)!.code;
    expect(component).toContain(`useComputedQrl(q_${chunks[0].segment!.name})`);
  }
);

test('a local useComputed$ function is not a core hook', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `export default () => {
  const useComputed$ = (compute) => ({ value: compute() });
  const answer = useComputed$(() => 42);
  return <span>{answer.value}</span>;
};`,
    },
    {}
  );
  expect(plan.programs.flatMap((program) => program.setup).map((entry) => entry.s)).toEqual([
    SetupKind.Const,
    SetupKind.Hook,
  ]);
});
