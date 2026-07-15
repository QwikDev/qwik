import type { TransformModuleInput, TransformModulesOptions } from '@qwik.dev/optimizer';
import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { transformModules } from './index';

const options = (input: TransformModuleInput, isServer: boolean): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer,
});

describe('setup QRL emission', () => {
  test('transforms boundaries in a module without components', async () => {
    const input = {
      path: 'src/use-counter.ts',
      code: `import { useComputed$, useSignal } from '@qwik.dev/core';
export function useCounter(initial) {
  const count = useSignal(initial);
  const double = useComputed$(() => count.value * 2);
  return { count, double };
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(ssr.modules).toHaveLength(2);
    expect(csr.modules).toHaveLength(2);
    expect(ssrMain).toContain('useComputedQrl(q_use_counter_useComputed$_segment_0.w([count]))');
    expect(csrMain).toContain(
      'useComputed(_withCaptures(use_counter_useComputed$_segment_0, [count]))'
    );
  });

  test('transforms useTask$ inside a component-free custom hook module', async () => {
    const input = {
      path: 'src/use-task-hook.ts',
      code: `import { useSignal, useTask$ } from '@qwik.dev/core';
export function useCounterTask() {
  const count = useSignal(0);
  useTask$(() => count.value++);
  return count;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csr.modules[0]?.code).toContain(
      'useTask(_withCaptures(use_task_hook_useTask$_segment_0, [count]))'
    );
    expect(ssr.modules[0]?.code).toContain(
      'useTaskQrl(q_use_task_hook_useTask$_segment_0.w([count]))'
    );
  });

  test('turns a module visible task into an SSR event carrier', async () => {
    const input = {
      path: 'src/use-visible.ts',
      code: `import { useVisibleTask$ } from '@qwik.dev/core';
export function useVisible() {
  useVisibleTask$(() => console.log('visible'), { strategy: 'document-ready' });
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const main = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(main).toMatch(
      /__qwik_useOnDocument\("qinit", __qwik_createVisibleTaskHandlerQrl\(q_use_visible_useVisibleTask\$_segment_0\)\)/
    );
    expect(main).not.toContain('useVisibleTaskQrl');
    expect(csrMain).toContain('useVisibleTask(use_visible_useVisibleTask$_segment_0, {');
    expect(csrMain).not.toContain('useVisibleTaskQrl');
  });

  test('flushes task work hidden behind an imported custom hook on SSR', async () => {
    const input = {
      path: 'src/custom-task.tsx',
      code: `import { useCounterTask as task } from './use-counter';
export function App() {
  const count = task();
  return <p>{count.value}</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const main = ssr.modules[0]?.code ?? '';

    expect(ssr.diagnostics).toEqual([]);
    expect(main).toContain('const invokeCtx = getActiveInvokeContextOrNull();');
    expect(main).toContain('task();');
    expect(main).toContain('maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx, () => {');
  });

  test('lowers module style boundaries without a style segment module', async () => {
    const input = {
      path: 'src/use-red.ts',
      code: `import { useStyles$, useStylesScoped$ } from '@qwik.dev/core';
export function useRed() {
  useStyles$('body { color: black }');
  return useStylesScoped$('.red { color: red }');
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(ssr.modules).toHaveLength(1);
    expect(csr.modules).toHaveLength(1);
    expect(ssr.modules[0]?.code).toMatch(/useStyles\("body \{ color: black \}", "[^"]+"\)/);
    expect(csr.modules[0]?.code).toMatch(/useStyles\("body \{ color: black \}", "[^"]+"\)/);
    expect(ssr.modules[0]?.code).toMatch(
      /return \(\{ scopeId: useStylesScoped\("\.red \{ color: red \}", "[^"]+", true\) \}\);/
    );
    expect(csr.modules[0]?.code).toMatch(
      /return \(\{ scopeId: useStylesScoped\("\.red \{ color: red \}", "[^"]+", true\) \}\);/
    );
    expect(ssr.modules[0]?.code).not.toContain('_qrlWithChunk');
  });

  test('rejects a scoped style boundary hidden in a non-hook helper', async () => {
    const input = {
      path: 'src/helper.ts',
      code: `import { useStylesScoped$ } from '@qwik.dev/core';
export function helper() {
  useStylesScoped$('.red {}');
}
`,
    };

    const result = await transformModules(options(input, true));

    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics[0]?.code).toBe('style-hook');
  });

  test('applies a custom-hook scope to author JSX but not child component JSX', async () => {
    const input = {
      path: 'src/custom-style.tsx',
      code: `import { useSignal } from '@qwik.dev/core';
import { useRed } from './use-red';
function Child() { return <i>child</i>; }
export function App() {
  useRed();
  const active = useSignal(true);
  return <section><div class="static"/><span class={active.value}/>{active.value && <b>branch</b>}<Child/></section>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const csrChild = csr.modules.find((module) => module.path.includes('_component_Child'))?.code;
    const csrBranch = csr.modules.find((module) => module.path.includes('branch_then'))?.code ?? '';

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(ssrMain).toContain("getActiveInvokeContext().styleScopes?.join(' ')");
    expect(csrMain).toContain("getActiveInvokeContext().styleScopes?.join(' ')");
    expect(csrMain).toContain('styleScope0 + " static"');
    expect(csrMain).toContain('createAttrEffect(el2, "class", active, ctx.scheduler, styleScope0)');
    expect(csrMain).toContain('styleScope0])');
    expect(csrBranch).toContain('styleScope0 = _captures[');
    expect(csrBranch).toContain('className = styleScope0');
    expect(csrChild).not.toContain('styleScopes');
  });

  test('numbers a custom-hook scope after colliding component bindings', async () => {
    const input = {
      path: 'src/custom-style-collision.tsx',
      code: `import { useRed } from './use-red';
export function App() {
  const styleScope0 = 'first';
  const styleScope1 = 'second';
  useRed();
  return <div>{styleScope0}{styleScope1}</div>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';

    expect(csr.diagnostics).toEqual([]);
    expect(main).toContain("const styleScope2 = getActiveInvokeContext().styleScopes?.join(' ');");
  });

  test('rejects namespace custom hook calls', async () => {
    const input = {
      path: 'src/namespace-hook.tsx',
      code: `import * as hooks from './hooks';
export function App() {
  hooks.useFeature();
  return <p>ready</p>;
}
`,
    };

    const result = await transformModules(options(input, true));

    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics[0]?.code).toBe('custom-hook');
  });

  test('rejects a custom hook inside a collection row render function', async () => {
    const input = {
      path: 'src/row-hook.tsx',
      code: `import { useFeature } from './feature';
export function App({ items }) {
  return <ul>{items.map((item) => {
    useFeature();
    return <li>{item}</li>;
  })}</ul>;
}
`,
    };

    const result = await transformModules(options(input, false));

    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics[0]?.code).toBe('custom-hook');
  });

  test('maps boundary-only main and segment modules', async () => {
    const input = {
      path: 'src/mapped-hook.ts',
      code: `import { useFoo$ } from 'library';
export function useMapped(value: number) {
  return useFoo$(() => value);
}
`,
    };
    const result = await transformModules({
      ...options(input, false),
      sourceMaps: true,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules).toHaveLength(2);
    expect(result.modules.every((module) => module.map != null)).toBe(true);
  });

  test('moves module references used only by a boundary into its segment', async () => {
    const input = {
      path: 'src/use-helper.ts',
      code: `import { useFoo$ } from 'library';
import { helper } from './helper';
export function useHelper(value) {
  return useFoo$(() => helper(value));
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';
    const segment = csr.modules.find((module) => module.segment != null)?.code ?? '';

    expectValidModules(csr.modules);
    expect(main).not.toContain(`from "./helper"`);
    expect(segment).toContain(`from "./helper"`);
    expect(segment).toContain('helper(value)');
  });

  test('preserves async and value payloads in boundary-only modules', async () => {
    const input = {
      path: 'src/use-values.ts',
      code: `import { useSerializer$ } from '@qwik.dev/core';
import { useFoo$ } from 'library';
export function useValues(value) {
  const task = useFoo$(async () => {
    await Promise.resolve();
    return value;
  });
  const serializer = useSerializer$({
    initial: 0,
    serialize: (input) => input,
    deserialize: (input) => input,
  });
  return { task, serializer };
}
`,
    };

    const csr = await transformModules(options(input, false));
    const output = csr.modules.map((module) => module.code).join('\n');

    expectValidModules(csr.modules);
    expect(csr.diagnostics).toEqual([]);
    expect(csr.modules.filter((module) => module.segment != null)).toHaveLength(2);
    expect(output).toContain('export const use_values_useFoo$_segment_0 = async () =>');
    expect(output).toContain('(await _await(Promise.resolve()))();');
    expect(output).toContain('useSerializer(use_values_useSerializer$_segment_1)');
  });

  test('transforms independent component and module boundaries together', async () => {
    const input = {
      path: 'src/mixed.tsx',
      code: `import { useComputed$, useSignal } from '@qwik.dev/core';
export function useDouble(value) {
  return useComputed$(() => value.value * 2);
}
export function App() {
  const count = useSignal(1);
  return <p>{count.value}</p>;
}
`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const output = result.modules.map((module) => module.code).join('\n');
      expectValidModules(result.modules);
      expect(result.diagnostics).toEqual([]);
      expect(output).toContain('mixed_useComputed$_segment_0');
      expect(result.modules.filter((module) => module.segment != null)).toHaveLength(1);
    }
  });

  test('reuses target aliases and preserves marker value uses without a component', async () => {
    const input = {
      path: 'src/custom-hook.ts',
      code: `import { useFoo$ as marker, useFoo as direct, useFooQrl as lazy } from 'library';
export const retained = [marker, direct, lazy];
export function useCustom(value) {
  return marker(() => value, { mode: 'test' });
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csrMain).toContain('useFoo$ as marker');
    expect(ssrMain).toContain('useFoo$ as marker');
    expect(csrMain).toContain(
      `direct(_withCaptures(custom_hook_useFoo$_segment_0, [value]), { mode: "test" })`
    );
    expect(ssrMain).toContain(`lazy(q_custom_hook_useFoo$_segment_0.w([value]), { mode: "test" })`);
  });

  test('transforms nested module boundaries transitively', async () => {
    const input = {
      path: 'src/nested-hook.ts',
      code: `import { outer$, inner$ } from 'library';
export function useNested(value) {
  return outer$(() => inner$(() => value));
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(ssr.modules.filter((module) => module.segment != null)).toHaveLength(2);
    expect(csr.modules.filter((module) => module.segment != null)).toHaveLength(2);
    expect(ssr.modules.map((module) => module.code).join('\n')).toContain('innerQrl');
    expect(csr.modules.map((module) => module.code).join('\n')).toContain('inner(');
  });

  test('uses exported local companions in a module without components', async () => {
    const input = {
      path: 'src/local-hook.ts',
      code: `export const useLocal$ = (value) => value;
export const useLocal = (value) => value;
export const useLocalQrl = (value) => value;
export function useHook(value) {
  return useLocal$(() => value);
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csr.modules[0]?.code).toContain(
      'useLocal(_withCaptures(local_hook_useLocal$_segment_0, [value]))'
    );
    expect(ssr.modules[0]?.code).toContain(
      'useLocalQrl(q_local_hook_useLocal$_segment_0.w([value]))'
    );
  });

  test('diagnoses a missing local target companion without partial output', async () => {
    const input = {
      path: 'src/missing-hook.ts',
      code: `export const useLocal$ = (value) => value;
export function useHook() {
  return useLocal$(() => 1);
}
`,
    };

    const result = await transformModules(options(input, false));
    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('missing-direct-implementation');
  });

  test('diagnoses a module boundary without an extractable first argument', async () => {
    const input = {
      path: 'src/invalid-hook.ts',
      code: `import { useFoo$ } from 'library';
export function useInvalid() {
  useFoo$();
}
`,
    };

    const result = await transformModules(options(input, false));
    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('implicit-dollar-argument');
  });

  test('diagnoses unsupported JSX in a module boundary without misclassifying the hook', async () => {
    const input = {
      path: 'src/jsx-hook.tsx',
      code: `import { useFoo$ } from 'library';
export function useView() {
  return useFoo$(() => <span>View</span>);
}
`,
    };

    const result = await transformModules(options(input, false));
    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('unsupported-boundary-shape');
  });

  test('emits useTaskQrl for SSR and useTask with a function for CSR', async () => {
    const input = {
      path: 'src/task.tsx',
      code: `import { useSignal, useTask$ } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  useTask$(async () => {
    await Promise.resolve();
    return count.value;
  }, { deferUpdates: false });
  return <button>{count.value}</button>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);

    expect(ssr.modules).toHaveLength(2);
    expect(ssrMain).toContain('useTaskQrl(q_task_useTask$_segment_0.w([count]), {');
    expect(ssrMain).not.toContain('runTaskSubscriber');
    expect(ssrMain).not.toContain('ctx.addRoot(task');
    expect(ssrMain).toContain(
      'return maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx, () => {'
    );
    expect(ssrMain).toContain('export function App(props, ctx)');

    expect(csr.modules).toHaveLength(2);
    expect(csrMain).toContain(
      'useTask(_withCaptures(task_useTask$_segment_0, [count]), { deferUpdates: false });'
    );
    expect(csrMain).not.toContain('useTaskQrl');
    expect(csrMain).not.toContain('_qrlWithChunk');
    expect(csr.modules[1]?.code).toContain('export const task_useTask$_segment_0 = async () => {');
    expect(csr.modules[1]?.code).toContain('import { _captures, _await }');
    expect(csr.modules[1]?.code).toContain('(await _await(Promise.resolve()))();');
    expect(csr.modules[1]?.code).not.toContain('yield');
  });

  test('emits QRL hooks on SSR and function hooks on CSR', async () => {
    const input = {
      path: 'src/computed.tsx',
      code: `import { useComputed$, useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(1);
  const double = useComputed$(() => count.value * 2);
  return <p>{double.value}</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';

    expect(ssrMain).toContain('useComputedQrl(q_computed_useComputed$_segment_0.w([count]))');
    expect(ssrMain).toContain(
      'q_computed_useComputed$_segment_0.s(computed_useComputed$_segment_0);'
    );
    expect(ssrMain).not.toContain('scheduler.flush');
    expect(csrMain).toContain(
      'useComputed(_withCaptures(computed_useComputed$_segment_0, [count]))'
    );
    expect(csrMain).not.toContain('useComputedQrl');
    expect(csrMain).not.toContain('_qrlWithChunk');
  });

  test('passes a capture-free task function directly on CSR', async () => {
    const input = {
      path: 'src/plain-task.tsx',
      code: `import { useTask$ } from '@qwik.dev/core';
export function App() {
  useTask$(() => console.log('run'));
  return <p>Task</p>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const csrMain = csr.modules[0]?.code ?? '';

    expect(csrMain).toContain('useTask(plain_task_useTask$_segment_0);');
    expect(csrMain).not.toContain('_withCaptures');
  });

  test('emits every direct task in source order', async () => {
    const input = {
      path: 'src/tasks.tsx',
      code: `import { useSignal, useTask$ } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  useTask$(() => count.value++);
  useTask$(() => count.value--);
  return <p>{count.value}</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(ssr.modules).toHaveLength(3);
    expect(ssrMain).toContain('useTaskQrl(q_tasks_useTask$_segment_0.w([count]))');
    expect(ssrMain).toContain('useTaskQrl(q_tasks_useTask$_segment_1.w([count]))');
    expect(ssrMain.indexOf('useTaskQrl(q_tasks_useTask$_segment_0')).toBeLessThan(
      ssrMain.indexOf('useTaskQrl(q_tasks_useTask$_segment_1')
    );
    expect(ssrMain.match(/ctx\.scheduler\.flush\(\)/g)).toHaveLength(1);
    expect(csr.modules).toHaveLength(3);
    expect(csrMain).toContain('useTask(_withCaptures(tasks_useTask$_segment_0, [count]));');
    expect(csrMain).toContain('useTask(_withCaptures(tasks_useTask$_segment_1, [count]));');
  });

  test('keeps explicit dollar lazy on SSR and uses its function on CSR', async () => {
    const input = {
      path: 'src/explicit.tsx',
      code: `import { $ } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  const handler = $(() => count.value++);
  return <button>Ready</button>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';

    expect(ssrMain).toContain('const handler = q_explicit_$_segment_0.w([count]);');
    expect(ssrMain).not.toContain('q_explicit_$_segment_0.s(');
    expect(csrMain).toContain('const handler = _withCaptures(explicit_$_segment_0, [count]);');
  });

  test('uses existing same-source target aliases and removes a marker with no value uses', async () => {
    const input = {
      path: 'src/external.tsx',
      code: `import { marker$ as marker, marker as direct, markerQrl as lazy } from 'library';
import { useSignal } from '@qwik.dev/core';
export const targets = [direct, lazy];
export function App() {
  const count = useSignal(0);
  marker(() => count.value, { mode: 'test' });
  return <p>External</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csrMain).toContain(
      `direct(_withCaptures(external_marker$_segment_0, [count]), { mode: "test" });`
    );
    expect(csrMain).not.toContain('markerQrl(');
    expect(csrMain).not.toContain('_qrlWithChunk');
    expect(ssrMain).toContain('lazy(q_external_marker$_segment_0.w([count]), { mode: "test" });');
    expect(csrMain).not.toContain('marker$ as marker');
    expect(ssrMain).not.toContain('marker$ as marker');
    expect(csr.modules.some((module) => module.path.includes('marker$_segment_0'))).toBe(true);
    expect(ssr.modules.some((module) => module.path.includes('marker$_segment_0'))).toBe(true);
  });

  test('passes a capture-free value segment to the direct CSR API', async () => {
    const input = {
      path: 'src/serializer.tsx',
      code: `import { useSerializer$ } from '@qwik.dev/core';
export function App() {
  const value = useSerializer$({
    initial: 'ready',
    serialize(input) { return input; },
    deserialize(input) { return input; }
  });
  return <p>Serializer</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const csrMain = csr.modules[0]?.code ?? '';
    const valueModule = csr.modules.find((module) =>
      module.path.includes('useSerializer$_segment')
    );

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csrMain).toMatch(/useSerializer\w*\(serializer_useSerializer\$_segment_0\)/);
    expect(csrMain).not.toContain('_withCaptures(serializer_useSerializer$_segment_0');
    expect(csrMain).not.toContain('useSerializerQrl');
    expect(valueModule?.code).toContain('export const serializer_useSerializer$_segment_0 = {');
    expect(ssr.modules[0]?.code).toContain(
      'useSerializerQrl(q_serializer_useSerializer$_segment_0)'
    );
  });

  test('emits captured serializer values as factories', async () => {
    const input = {
      path: 'src/serializer-capture.tsx',
      code: `import { useSerializer$, useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(1);
  useSerializer$({
    initial: 0,
    serialize: (value) => value,
    deserialize: (value) => value + count.value,
  });
  return <p>Serializer</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const csrMain = csr.modules[0]?.code ?? '';
    const valueModule = csr.modules.find((module) =>
      module.path.includes('useSerializer$_segment')
    );

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(csrMain).toContain(
      'useSerializer(_withCaptures(serializer_capture_useSerializer$_segment_0, [count]))'
    );
    expect(valueModule?.code).toContain(
      'export const serializer_capture_useSerializer$_segment_0 = () => {'
    );
    expect(valueModule?.code).toContain('const count = _captures[0];');
    expect(ssr.modules[0]?.code).toContain(
      'useSerializerQrl(q_serializer_capture_useSerializer$_segment_0.w([count]))'
    );
  });

  test('uses the same target-aware rules inside extracted segments', async () => {
    const input = {
      path: 'src/nested.tsx',
      code: `import { outer$, inner$ } from 'library';
import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  outer$(() => inner$(async () => {
    await Promise.resolve();
    return count.value;
  }));
  return <p>Nested</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const csrOuter = csr.modules.find((module) => module.path.includes('outer$_segment_0'))!;
    const csrInner = csr.modules.find((module) => module.path.includes('inner$_segment_1'))!;
    const ssrOuter = ssr.modules.find((module) => module.path.includes('outer$_segment_0'))!;

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csrOuter.code).toContain('_withCaptures(nested_inner$_segment_1, [count])');
    expect(csrOuter.code).not.toContain('_qrlWithChunk');
    expect(csrInner.code).toContain('(await _await(Promise.resolve()))();');
    expect(ssrOuter.code).toContain('innerQrl');
    expect(ssrOuter.code).toContain('q_nested_inner$_segment_1.w([count])');
  });

  test('uses exported local companions for each target', async () => {
    const input = {
      path: 'src/local.tsx',
      code: `export const local$ = (value) => value;
export const local = (value) => value;
export const localQrl = (value) => value;
export function App() {
  local$(() => 1);
  return <p>Local</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csr.modules[0]?.code).toContain('local(local_local$_segment_0);');
    expect(ssr.modules[0]?.code).toContain('localQrl(q_local_local$_segment_0);');
  });

  test('retargets an unused marker specifier while preserving comments and attributes', async () => {
    const input = {
      path: 'src/imports.tsx',
      code: `// keep target comment
import { marker$ as marker, keep } from 'library' with { type: 'custom' };
const __qwik_marker = 1;
export const retained = [keep, __qwik_marker];
export function App() {
  marker(() => 1);
  return <p>Imports</p>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';

    expectValidModules(csr.modules);
    expect(main).toContain('// keep target comment');
    expect(main).toContain('with { type: "custom" }');
    expect(main).toContain('import { marker, keep } from "library"');
    expect(main).toContain('marker(imports_marker$_segment_0);');
    expect(main).not.toContain('marker$ as marker');
  });

  test('keeps a marker value import and avoids target alias collisions', async () => {
    const input = {
      path: 'src/collision.tsx',
      code: `import { marker$ as marker } from 'library';
const __qwik_marker = 1;
export const retained = [marker, __qwik_marker];
export function App() {
  marker(() => 1);
  return <p>Collision</p>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';

    expectValidModules(csr.modules);
    expect(main).toContain('marker$ as marker');
    expect(main).toContain('marker as __qwik_marker_0');
    expect(main).toContain('__qwik_marker_0(collision_marker$_segment_0);');
  });

  test('does not retarget a marker onto an existing local binding', async () => {
    const input = {
      path: 'src/local-collision.tsx',
      code: `import { marker$ } from 'library';
const marker = 'local';
export const retained = marker;
export function App() {
  marker$(() => 1);
  return <p>Collision</p>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';

    expectValidModules(csr.modules);
    expect(main).not.toContain('marker$ } from');
    expect(main).toContain('marker as __qwik_marker');
    expect(main).toContain('__qwik_marker(local_collision_marker$_segment_0);');
  });
});

function expectValidModules(modules: readonly { path: string; code: string }[]) {
  for (const module of modules) {
    expect(
      parseSync(module.path, module.code, { lang: 'js', sourceType: 'module' }).errors
    ).toEqual([]);
  }
}
