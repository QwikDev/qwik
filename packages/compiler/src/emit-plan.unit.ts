import { describe, expect, test } from 'vitest';
import { transformModules } from './index';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';

/** Snapshot the per-module SSR plan JSON (format version 0) for representative components. */
async function planSnapshot(snapshotName: string, code: string) {
  const result = await transformModules({
    input: [{ path: 'src/input.tsx', code }],
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer: true,
    emitPlan: true,
  } as TransformModulesOptions & { emitPlan: boolean });
  const plan = result.modules.find((module) => module.path.endsWith('.plan.json'));
  expect(plan, 'plan module emitted').toBeDefined();
  await expect(plan!.code).toMatchFileSnapshot(`./snapshots/${snapshotName}.plan.snap`);
}

describe('emitModulePlan', () => {
  test('signal counter', async () => {
    await planSnapshot(
      'plan_signal_counter',
      [
        `import { useSignal } from '@qwik.dev/core';`,
        ``,
        `export function App() {`,
        `  const count = useSignal(3);`,
        `  return <button onClick$={() => count.value++}>{count.value}</button>;`,
        `}`,
      ].join('\n')
    );
  });

  test('branch, collection, computed, and task', async () => {
    await planSnapshot(
      'plan_branch_collection_task',
      [
        `import { useComputed$, useSignal, useTask$ } from '@qwik.dev/core';`,
        ``,
        `export function App() {`,
        `  const items = useSignal(['a', 'b']);`,
        `  const label = useSignal('idle');`,
        `  const total = useComputed$(() => items.value.length * 2);`,
        `  useTask$(() => {`,
        `    if (items.value.length === 0) {`,
        `      label.value = 'empty';`,
        `    }`,
        `  });`,
        `  return (`,
        `    <section title={label.value}>`,
        `      {items.value.length === 0 ? (`,
        `        <p>Empty</p>`,
        `      ) : (`,
        `        <ul>`,
        `          {items.value.map((item, index) => (`,
        `            <li key={item}>{index + 1}. {item.toUpperCase()}</li>`,
        `          ))}`,
        `        </ul>`,
        `      )}`,
        `      <footer>{total.value}</footer>`,
        `    </section>`,
        `  );`,
        `}`,
      ].join('\n')
    );
  });
});
