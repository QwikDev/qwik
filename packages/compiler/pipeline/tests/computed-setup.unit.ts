import { describe, expect, test } from 'vitest';
import { analyseModule, linkPlans } from '../index';
import {
  BoundaryKind,
  LinkResultKind,
  OpKind,
  ProgramBodyKind,
  SetupKind,
  CallTargetKind,
  CoreOperation,
  ValueKind,
  EntryKind,
  ArgKind,
} from '../schema';
import { deepFreeze, serverSpecialization, loadDefaultFunction } from './fixtures';
import { UnsupportedError } from '../errors';
import { ResolutionKind } from '../link/link-plans';
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

test('async computed setup caches, tracks after await and recovers from errors', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { useSignal, useComputed$ } from '@qwik.dev/core';
export default () => {
  const count = useSignal(1);
  const doubled = useComputed$(async function () {
    await ready();
    if (count.value < 0) throw new Error('negative');
    return count.value * 2;
  });
  return <span />;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  let count!: core.Signal<number>;
  let doubled!: ComputedQrl<unknown>;
  let runs = 0;
  const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
    ...core,
    get _captures() {
      return core._captures;
    },
    async ready() {
      runs++;
    },
    useSignal(initial: number) {
      count = core.useSignal(initial);
      return count;
    },
    useComputedQrl(...args: Parameters<typeof core.useComputedQrl>) {
      doubled = core.useComputedQrl(...args);
      return doubled;
    },
  });
  const owner = core.createOwner(null);
  try {
    core.runWithOwner(owner, render, undefined, {});
    await doubled.promise();
    expect(doubled.value).toBe(2);
    expect(doubled.value).toBe(2);
    expect(runs).toBe(1);
    count.value = -1;
    await doubled.promise();
    expect(doubled.error?.message).toBe('negative');
    expect(() => doubled.value).toThrow('negative');
    count.value = 3;
    await doubled.promise();
    expect(doubled.value).toBe(6);
    expect(doubled.error).toBeUndefined();
    expect(runs).toBe(3);
  } finally {
    await core.disposeOwner(owner);
  }
});

test('SSR waits beyond the initial computed value and escapes resolved text', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { useComputed$ } from '@qwik.dev/core';
export default () => {
  const label = useComputed$(async () => await loadLabel(), { initial: () => '<initial&>' });
  return <span>{label.value}</span>;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  let release!: (value: string) => void;
  const label = new Promise<string>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const loading = new Promise<void>((resolve) => {
    started = resolve;
  });
  let runs = 0;
  let finished = false;
  const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
    ...core,
    get _captures() {
      return core._captures;
    },
    loadLabel() {
      runs++;
      started();
      return label;
    },
  });
  const rendering = renderToString(render).then((result) => {
    finished = true;
    return result;
  });
  await loading;
  expect(finished).toBe(false);
  release('<value&>');
  const result = await rendering;
  expect(result.html).toContain('&lt;value&amp;&gt;</span>');
  expect(runs).toBe(1);
});

describe.each([false, true])('computed options (forwarded QRL: %s)', (forwarded) => {
  test.each(['options', '...extras', 'readOptions(seed)', '{ initial: () => seed }'])(
    'preserves initial value and evaluates options once: %s',
    async (argument) => {
      const output = await transformModules({
        srcDir: 'src',
        isServer: true,
        input: [
          {
            path: 'src/component.tsx',
            code: `import { $, useComputed$ } from '@qwik.dev/core';
export default (props) => {
  const seed = props.initial;
  const options = props.options;
  const extras = [options];
  ${forwarded ? 'const read = $(async () => 42);' : ''}
  const answer = useComputed$(${forwarded ? 'read' : 'async () => 42'}, ${argument});
  return <span />;
};`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      expect(output.modules.filter((module) => module.segment)).toHaveLength(1);
      let computed!: ComputedQrl<unknown>;
      let optionReads = 0;
      const options = { initial: 7 };
      const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
        ...core,
        get _captures() {
          return core._captures;
        },
        readOptions(seed: number) {
          expect(seed).toBe(7);
          optionReads++;
          return options;
        },
        useComputedQrl(...args: Parameters<typeof core.useComputedQrl>) {
          if (argument !== '{ initial: () => seed }') {
            expect(args[1]).toBe(options);
          }
          computed = core.useComputedQrl(...args);
          return computed;
        },
      });
      const owner = core.createOwner(null);
      try {
        core.runWithOwner(owner, render, { initial: 7, options }, {});
        expect(computed.value).toBe(7);
        expect(computed.pending).toBe(true);
        await computed.promise();
        expect(computed.value).toBe(42);
        expect(computed.pending).toBe(false);
        expect(optionReads).toBe(argument === 'readOptions(seed)' ? 1 : 0);
      } finally {
        await core.disposeOwner(owner);
      }
    }
  );
});

test('computed setup uses existing invocation and signal-read plans', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `import { useSignal, useComputed$ as computed } from '@qwik.dev/core';
export default () => {
  const count = useSignal(1);
  const doubled = computed(() => count.value * 2, { initial: count.value });
  return <span>{doubled.value}</span>;
};`,
    },
    {}
  );
  const program = plan.programs.find((program) => program.setup.length > 0)!;
  expect(program.setup.map((entry) => entry.s === SetupKind.Call && entry.target)).toEqual([
    { kind: CallTargetKind.Core, operation: CoreOperation.CreateSignal },
    { kind: CallTargetKind.Core, operation: CoreOperation.CreateComputed },
  ]);
  const callback = plan.qrls.find((qrl) => qrl.ctxName === 'useComputed$')!;
  expect(callback.boundary).toEqual({ kind: BoundaryKind.Implicit, role: 'hook' });
  expect(callback.captures.map((capture) => plan.bindings[capture.binding].name)).toEqual([
    'count',
  ]);
  expect(program.setup[1]).toMatchObject({
    s: SetupKind.Call,
    args: [{ a: ArgKind.Qrl, use: { qrl: callback.id } }, { a: ArgKind.Expr }],
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
    { edges: { [plan.path]: { 0: { r: ResolutionKind.External } } } },
    { claims: [], policies: [], emissions: [] },
    true
  );
  expect(linked.kind).toBe(LinkResultKind.Linked);
  if (linked.kind === LinkResultKind.Linked) {
    expect(linked.plan.modules[0].edges[0].runtime).toBe(false);
  }
  expect(plan).toEqual(restored);
});

test.each(['useComputed$()', 'useComputed$(callback)', 'useComputed$(...callbacks)'])(
  'deferred computed forms remain unsupported: %s',
  async (initializer) => {
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
  }
);

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
    SetupKind.Call,
  ]);
});
