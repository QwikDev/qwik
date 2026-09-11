import { expect, test } from 'vitest';
import { analyseModule, generateJsCsr, generateJsSsr, linkPlans, ResolutionKind } from '../index';
import { EntryKind, Environment, LinkResultKind, SetupKind } from '../schema';
import { deepFreeze, serverSpecialization } from './fixtures';

const source = `import { useSignal as signal, useComputed$ as computed } from '@qwik.dev/core';
import { useCustom as hook } from './hooks';
export default ({ format: formatter }) => {
  const count = signal(1);
  const doubled = computed(() => count.value * 2);
  const result = hook();
  const local = (value) => value;
  const plain = local(result);
  const label = formatter(plain);
  return <span>{label}</span>;
};`;

test('setup calls have one semantic target, independent of JS spelling', async () => {
  const plan = await analyseModule({ path: 'component.tsx', code: source }, {});
  const binding = (name: string) => plan.bindings.find((entry) => entry.name === name)!.id;
  const calls = plan.programs
    .flatMap((program) => program.setup)
    .filter((entry) => entry.s === SetupKind.Call);
  expect(calls.map((call) => call.target)).toEqual([
    { kind: 'core', operation: 'create-signal' },
    { kind: 'core', operation: 'create-computed' },
    { kind: 'binding', binding: binding('hook') },
    { kind: 'binding', binding: binding('local') },
    {
      kind: 'value',
      value: {
        kind: 'member',
        obj: { kind: 'binding-read', binding: binding('props') },
        name: 'format',
      },
    },
  ]);
  // Only the custom hook may start a task the render must wait for.
  expect(calls.map((call) => call.blocksInitialRender)).toEqual([
    undefined,
    undefined,
    true,
    undefined,
    undefined,
  ]);
  for (const { blocksInitialRender: _, ...call } of calls) {
    expect(Object.keys(call).sort()).toEqual(['args', 'result', 's', 'target']);
  }
});

test.each([Environment.Server, Environment.Browser])(
  'call targets link and generate from frozen JSON plans: %s',
  async (environment) => {
    const plan = await analyseModule({ path: 'component.tsx', code: source }, {});
    const specialization = { ...serverSpecialization(), environment };
    const link = (input: typeof plan) =>
      linkPlans(
        [input],
        [{ kind: EntryKind.Module, module: input.path }],
        specialization,
        {
          edges: {
            [input.path]: { 0: { r: ResolutionKind.External }, 1: { r: ResolutionKind.External } },
          },
        },
        { claims: [], policies: [], emissions: [] },
        true
      );
    const original = link(plan);
    const restored = link(deepFreeze(JSON.parse(JSON.stringify(plan))));
    expect(restored).toEqual(original);
    if (original.kind !== LinkResultKind.Linked || restored.kind !== LinkResultKind.Linked) {
      throw new Error('expected linked call targets');
    }
    // Core dependencies belong to the backend, not the authored import.
    expect(restored.plan.modules[0].edges.map((edge) => edge.runtime)).toEqual([false, true]);
    const generate = environment === Environment.Server ? generateJsSsr : generateJsCsr;
    expect(await generate(deepFreeze(restored.plan), {})).toEqual(
      await generate(original.plan, {})
    );
  }
);
