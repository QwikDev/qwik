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

describe('hook capability metadata', () => {
  async function planFor(files: Record<string, string>) {
    const result = await transformModules({
      input: Object.entries(files).map(([path, code]) => ({ path, code })),
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
      emitPlan: true,
    } as TransformModulesOptions & { emitPlan: boolean });
    return result.modules
      .filter((module) => module.path.endsWith('.plan.json'))
      .map((module) => JSON.parse(module.code));
  }

  test('exported hooks record capabilities and nested custom-hook calls', async () => {
    const [plan] = await planFor({
      'src/hooks.ts': [
        `import { useStylesScoped$, useSignal } from '@qwik.dev/core';`,
        `import { useRemote } from './remote';`,
        `export function useTheme() {`,
        `  useStylesScoped$('.a{}');`,
        `  return useSignal(0);`,
        `}`,
        `export const useIndirect = () => {`,
        `  useRemote();`,
        `  return useTheme();`,
        `};`,
      ].join('\n'),
    });
    expect(plan.hooks).toEqual([
      { name: 'useTheme', capabilities: ['scoped-styles'], calls: [] },
      {
        name: 'useIndirect',
        capabilities: [],
        calls: [
          { module: './remote', name: 'useRemote' },
          { module: null, name: 'useTheme' },
        ],
      },
    ]);
  });

  test('components record their direct custom-hook calls', async () => {
    const [plan] = await planFor({
      'src/view.tsx': [
        `import { useTheme } from './theme';`,
        `export function App() {`,
        `  useTheme();`,
        `  return <p>hi</p>;`,
        `}`,
      ].join('\n'),
    });
    expect(plan.components[0].hookCalls).toEqual([{ module: './theme', name: 'useTheme' }]);
  });
});

describe('linker hook capability closure', () => {
  async function linkedFor(files: Record<string, string>, entryPath: string) {
    const result = await transformModules({
      input: Object.entries(files).map(([path, code]) => ({ path, code })),
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
      emitPlan: true,
    } as TransformModulesOptions & { emitPlan: boolean });
    const plans = result.modules
      .filter((module) => module.path.endsWith('.plan.json'))
      .map((module) => JSON.parse(module.code));
    const { linkSsrPlan } = await import('./link-plan');
    return linkSsrPlan(plans, 'App', entryPath);
  }

  test('transitive scoped-styles reach the component; unknown hooks are conservative', async () => {
    const linked = await linkedFor(
      {
        'src/theme.ts': [
          `import { useStylesScoped$ } from '@qwik.dev/core';`,
          `export function useTheme() {`,
          `  useStylesScoped$('.a{}');`,
          `}`,
        ].join('\n'),
        'src/indirect.ts': [
          `import { useTheme } from './theme';`,
          `export function useIndirect() {`,
          `  useTheme();`,
          `}`,
        ].join('\n'),
        'src/view.tsx': [
          `import { useIndirect } from './indirect';`,
          `import { useMystery } from 'some-lib';`,
          `export function App() {`,
          `  useIndirect();`,
          `  return <p>hi</p>;`,
          `}`,
          `export function Plain() {`,
          `  return <p>plain</p>;`,
          `}`,
          `export function External() {`,
          `  useMystery();`,
          `  return <p>ext</p>;`,
          `}`,
        ].join('\n'),
      },
      'src/view.tsx'
    );
    expect(linked).not.toBeNull();
    const byName = new Map(linked!.components.map((component) => [component.name, component]));
    expect(byName.get('App')!.runtimeStyleScope).toBe(true);
    expect(byName.get('Plain')!.runtimeStyleScope).toBe(false);
    // unknown package hook: conservative — every capability assumed
    expect(byName.get('External')!.runtimeStyleScope).toBe(true);
    expect(byName.get('External')!.providesContext).toBe(true);
  });
});
