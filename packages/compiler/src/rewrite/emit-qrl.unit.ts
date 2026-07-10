import type { TransformModuleInput, TransformModulesOptions } from '@qwik.dev/optimizer';
import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { transformModules } from '../index';

const options = (input: TransformModuleInput, isServer: boolean): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer,
});

describe('rewrite setup QRL emission', () => {
  test('emits useTaskQrl for SSR and useTask with a function for CSR', async () => {
    const input = {
      path: 'src/task.tsx',
      code: `import { useSignal, useTask$ } from '@qwik.dev/core/spark';
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
    expect(ssrMain).toContain('ctx.addRoot(task_segment_0);');
    expect(ssrMain).toContain('await runTaskSubscriber(task_segment_0);');
    expect(ssrMain).toContain('return invoke(invokeCtx, () => {');
    expect(ssrMain).toContain('export async function App(props, ctx)');

    expect(csr.modules).toHaveLength(2);
    expect(csrMain).toContain(
      'useTask(_withCaptures(task_useTask$_segment_0, [count]), { deferUpdates: false });'
    );
    expect(csrMain).not.toContain('_qrlWithChunk');
    expect(csr.modules[1]?.code).toContain('export const task_useTask$_segment_0 = async () => {');
    expect(csr.modules[1]?.code).toContain('await Promise.resolve();');
    expect(csr.modules[1]?.code).not.toContain('yield');
  });

  test('emits QRL hooks on SSR and function hooks on CSR', async () => {
    const input = {
      path: 'src/computed.tsx',
      code: `import { useComputed$, useSignal } from '@qwik.dev/core/spark';
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
    expect(csrMain).toContain(
      'useComputed(_withCaptures(computed_useComputed$_segment_0, [count]))'
    );
    expect(csrMain).not.toContain('_qrlWithChunk');
  });

  test('passes a capture-free task function directly on CSR', async () => {
    const input = {
      path: 'src/plain-task.tsx',
      code: `import { useTask$ } from '@qwik.dev/core/spark';
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
      code: `import { useSignal, useTask$ } from '@qwik.dev/core/spark';
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
    expect(ssrMain.indexOf('task_segment_0')).toBeLessThan(ssrMain.indexOf('task_segment_1'));
    expect(csr.modules).toHaveLength(3);
    expect(csrMain).toContain('useTask(_withCaptures(tasks_useTask$_segment_0, [count]));');
    expect(csrMain).toContain('useTask(_withCaptures(tasks_useTask$_segment_1, [count]));');
  });

  test('keeps explicit dollar lazy on SSR and uses its function on CSR', async () => {
    const input = {
      path: 'src/explicit.tsx',
      code: `import { $ } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core/spark';
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
});

function expectValidModules(modules: readonly { path: string; code: string }[]) {
  for (const module of modules) {
    expect(
      parseSync(module.path, module.code, { lang: 'js', sourceType: 'module' }).errors
    ).toEqual([]);
  }
}
