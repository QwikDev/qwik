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

describe('hook capability metadata', () => {
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

/** All `{kind:'render-arg'}` records anywhere in the plan JSON. */
function findRenderArgs(node: unknown, found: Record<string, unknown>[] = []) {
  if (Array.isArray(node)) {
    node.forEach((item) => findRenderArgs(item, found));
  } else if (typeof node === 'object' && node !== null) {
    if ((node as { kind?: string }).kind === 'render-arg') {
      found.push(node as Record<string, unknown>);
    }
    Object.values(node).forEach((value) => findRenderArgs(value, found));
  }
  return found;
}

describe('qrl prop spellings', () => {
  test('cb={$(fn)}, cb$={fn}, and cb$={$(fn)} all ride as segment values', async () => {
    const componentFor = (props: string) =>
      [
        `import { $, useSignal } from '@qwik.dev/core';`,
        `function Child() { return <p>Child</p>; }`,
        `export function App() {`,
        `  const count = useSignal(1);`,
        `  return <Child ${props} />;`,
        `}`,
      ].join('\n');
    for (const props of [
      'cb={$(() => count.value)}',
      'cb$={() => count.value}',
      'cb$={$(() => count.value)}',
    ]) {
      const [plan] = await planFor({ 'src/view.tsx': componentFor(props) });
      const prop = plan.components.find((c: { name: string }) => c.name === 'App').ssr.ops[0]
        .props[0];
      const value = prop.kind === 'event' ? prop.handlers[0].value : prop.value;
      expect(value.kind, props).toBe('segment');
    }
  });
});

describe('named dollar-import calls', () => {
  test('transform$(fn) rides as a plugin-call on the Qrl variant with a qrl-arg', async () => {
    const [plan] = await planFor({
      'src/view.tsx': [
        `import { transform$ } from './api';`,
        `import { useSignal } from '@qwik.dev/core';`,
        `function Child() { return <p>Child</p>; }`,
        `export function App() {`,
        `  const count = useSignal(1);`,
        `  return <Child implicit={transform$(() => count.value)} />;`,
        `}`,
      ].join('\n'),
      'src/api.ts': [
        `export const transformQrl = (qrl) => qrl;`,
        `export const transform$ = (fn) => fn;`,
      ].join('\n'),
    });
    const app = plan.components.find((c: { name: string }) => c.name === 'App');
    const prop = app.ssr.ops[0].props[0];
    expect(prop.value.kind).toBe('ir');
    expect(prop.value.ir.kind).toBe('plugin-call');
    expect(prop.value.ir.fnId).toBe('plugin:./api:transformQrl');
    expect(prop.value.ir.args[0]).toEqual({
      kind: 'qrl-arg',
      segment: expect.stringMatching(/^segment_/),
    });
  });

  test('unlowerable rest args fail the compile loudly', async () => {
    const result = await transformModules({
      input: [
        {
          path: 'src/view.tsx',
          code: [
            `import { transform$ } from './api';`,
            `import { useSignal } from '@qwik.dev/core';`,
            `function Child() { return <p>Child</p>; }`,
            `export function App() {`,
            `  const count = useSignal(1);`,
            `  const opts = { flag: true };`,
            `  return <Child implicit={transform$(() => count.value, { ...opts })} />;`,
            `}`,
          ].join('\n'),
        },
        { path: 'src/api.ts', code: `export const transform$ = (fn) => fn;` },
      ],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
    } as TransformModulesOptions);
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      expect.stringContaining('cannot emit'),
    ]);
  });
});

describe('render-arg wire hygiene', () => {
  test('framework imports never lower to plugin-calls', async () => {
    const [plan] = await planFor({
      'src/view.tsx': [
        `import { inlinedQrl, useSignal } from '@qwik.dev/core';`,
        `export function App() {`,
        `  const count = useSignal(0);`,
        `  const handler = inlinedQrl(() => count.value++, 'App_handler', [count]);`,
        `  return <button onClick$={handler}>increment</button>;`,
        `}`,
      ].join('\n'),
    });
    expect(JSON.stringify(plan)).not.toContain('plugin:@qwik.dev');
  });

  test('impure callbacks ride as qrl-backed fn-args, never raw placeholders', async () => {
    const [plan] = await planFor({
      'src/view.tsx': [
        `import { makeHandler } from './handlers';`,
        `import { useSignal } from '@qwik.dev/core';`,
        `export function App() {`,
        `  const count = useSignal(0);`,
        `  const handler = makeHandler(() => count.value++);`,
        `  return <button onClick$={handler}>{count.value}</button>;`,
        `}`,
      ].join('\n'),
      'src/handlers.ts': `export const makeHandler = (fn) => fn;`,
    });
    expect(findRenderArgs(plan)).toEqual([]);
    const setup = plan.components[0].ssr.setup;
    const handlerConst = setup.find(
      (entry: { kind: string; name?: string }) => entry.name === 'handler'
    );
    expect(handlerConst.init.kind).toBe('plugin-call');
    expect(handlerConst.init.args[0]).toEqual({
      kind: 'fn-arg',
      segment: expect.stringMatching(/^segment_/),
    });
  });

  test('render-position callbacks resolve to inline render blocks', async () => {
    const [plan] = await planFor({
      'src/view.tsx': [
        `import { runLater } from './scheduler';`,
        `export function App(props) {`,
        `  return <main>{runLater(() => <span>{props.label}</span>)}</main>;`,
        `}`,
      ].join('\n'),
      'src/scheduler.ts': `export const runLater = (fn) => fn();`,
    });
    const renderArgs = findRenderArgs(plan);
    expect(renderArgs.length).toBeGreaterThan(0);
    for (const arg of renderArgs) {
      expect(arg.render).toBeDefined();
      expect(arg.range).toBeUndefined();
    }
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

describe('sync qrl handlers', () => {
  test('sync$ handlers ride as segment values carrying their inlined source', async () => {
    const [plan] = await planFor({
      'src/view.tsx': [
        `import { sync$ } from '@qwik.dev/core';`,
        `export function App() {`,
        `  return <script document:onQInit$={[sync$(() => console.log('ready'))]} />;`,
        `}`,
      ].join('\n'),
    });
    const prop = plan.components[0].ssr.ops[0].props[0];
    expect(prop.kind).toBe('event');
    expect(prop.handlers[0].value).toEqual({
      kind: 'segment',
      segment: expect.stringMatching(/^segment_/),
    });
    const meta = plan.segments.find(
      (candidate: { id: string }) => candidate.id === prop.handlers[0].value.segment
    );
    expect(meta.qrl.kind).toBe('sync');
    expect(meta.syncSource).toBe(`() => console.log("ready")`);
  });
});
