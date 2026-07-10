import { describe, expect, test } from 'vitest';
import { parseModule } from '../stages/parse';
import type { CompilerContext } from '../types';
import { emitSegmentModules } from './emit-segment';
import { extractQrls } from './extract';

function extractInput(code: string) {
  const input = { path: 'src/component.tsx', code };
  const ctx: CompilerContext = {
    input,
    options: {
      input: [input],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
    },
    emitTarget: 'ssr',
    program: null,
    manifest: { components: [], segments: [], imports: [], diagnostics: [] },
    outputModules: null,
  };
  parseModule(ctx);
  expect(ctx.manifest.diagnostics).toEqual([]);
  return extractQrls(ctx.program!, input.path);
}

describe('extractQrls', () => {
  test('extracts an event handler with a local capture', () => {
    const extracted = extractInput(`import { useSignal } from '@qwik.dev/core/spark';
export const App = () => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>Count</button>;
};
`);

    expect(extracted.segments).toHaveLength(1);
    const [segment] = extracted.segments;
    expect(segment).toMatchObject({
      id: 'segment_0',
      parentId: null,
      name: 'component_q_e_click_segment_0',
      kind: 'event',
      ctxName: 'onClick$',
      captures: [{ name: 'count', source: 'local' }],
      moduleReferences: [],
    });
  });

  test('extracts one handler from a map callback with a loop capture', () => {
    const code = `export function App() {
  const rows = [{ selected: false }];
  return <>{rows.map((row) => <button onClick$={() => (row.selected = true)} />)}</>;
}
`;
    const extracted = extractInput(code);

    expect(extracted.segments).toHaveLength(1);
    expect(extracted.segments[0].captures).toEqual([{ name: 'row', source: 'loop' }]);
    const modules = emitSegmentModules(extracted.segments, code, 'src/component.tsx', false, 'ssr');
    expect(modules).toHaveLength(1);
    expect(modules[0].code).toContain('const row = _captures[0];');
    expect(modules[0].code).toContain('row.value.selected = true');
  });

  test('does not capture handler parameters or unresolved globals', () => {
    const extracted = extractInput(`export function App() {
  return <button onClick$={(event) => console.log(event.type)}>Click</button>;
}
`);

    expect(extracted.segments).toHaveLength(1);
    expect(extracted.segments[0].captures).toEqual([]);
    expect(extracted.segments[0].moduleReferences).toEqual([]);
  });

  test('records module references separately from captures', () => {
    const extracted = extractInput(`function save(value) {
  console.log(value);
}
export function App(props) {
  return <button onClick$={() => save(props.value)}>Save</button>;
}
`);

    expect(extracted.segments[0].captures).toEqual([{ name: 'props', source: 'param' }]);
    expect(extracted.segments[0].moduleReferences).toEqual(['save']);
  });

  test('records module declarations and destructured bindings', () => {
    const extracted = extractInput(`const base = 10;
const source = { helper: () => base };
const { helper } = source;
export function App() {
  return <button onClick$={() => helper()}>Run</button>;
}
`);

    expect(extracted.moduleDeclarations).toEqual([
      { range: expect.any(Array), names: ['base'], exported: false },
      {
        range: expect.any(Array),
        names: ['source'],
        exported: false,
      },
      {
        range: expect.any(Array),
        names: ['helper'],
        exported: false,
      },
      {
        range: expect.any(Array),
        names: ['App'],
        exported: true,
      },
    ]);
  });

  test('extracts dollar calls from the component body', () => {
    const extracted = extractInput(`import { useSignal, useTask$ } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  useTask$(() => count.value++);
  return <button>Count</button>;
}
`);

    expect(extracted.segments).toHaveLength(1);
    expect(extracted.segments[0]).toMatchObject({
      id: 'segment_0',
      name: 'component_useTask$_segment_0',
      kind: 'qrl',
      ctxName: 'useTask$',
      captures: [{ name: 'count', source: 'local' }],
    });
  });

  test('uses the imported dollar name for aliased calls', () => {
    const extracted = extractInput(`import { useTask$ as task } from '@qwik.dev/core/spark';
export function App() {
  task(() => console.log('run'));
  return <p>Task</p>;
}
`);

    expect(extracted.segments).toHaveLength(1);
    expect(extracted.segments[0]).toMatchObject({
      name: 'component_useTask$_segment_0',
      ctxName: 'useTask$',
      qwik: true,
    });
  });

  test('keeps third-party dollar imports separate from Qwik hooks', () => {
    const extracted = extractInput(`import { useTask$ } from 'third-party-library';
export function App() {
  useTask$(() => console.log('run'));
  return <p>Task</p>;
}
`);

    expect(extracted.segments).toHaveLength(1);
    expect(extracted.segments[0]).toMatchObject({
      ctxName: 'useTask$',
      qwik: false,
    });
  });

  test('propagates nested qrl captures to its parent segment', () => {
    const extracted = extractInput(`import { useSignal, useTask$ } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  return <button onClick$={() => useTask$(() => count.value++)}>Run</button>;
}
`);

    expect(extracted.segments).toHaveLength(2);
    expect(extracted.segments[0]).toMatchObject({
      id: 'segment_0',
      parentId: null,
      captures: [{ name: 'count', source: 'local' }],
    });
    expect(extracted.segments[1]).toMatchObject({
      id: 'segment_1',
      parentId: 'segment_0',
      captures: [{ name: 'count', source: 'local' }],
    });
  });

  test('records await expressions on their owning qrl', () => {
    const code = `import { $ } from '@qwik.dev/core/spark';
export const task = $(async () => {
  await first(await second());
  const helper = async () => await hidden();
  helper();
  return $(async () => await nested());
});
`;
    const extracted = extractInput(code);

    expect(extracted.segments).toHaveLength(2);
    expect(extracted.segments[0].awaits).toHaveLength(2);
    expect(extracted.segments[1].awaits).toHaveLength(1);

    const modules = emitSegmentModules(extracted.segments, code, 'src/component.tsx', false, 'csr');
    expect(modules[0].code).toContain('(await _await(first((await _await(second()))())))();');
    expect(modules[0].code).toContain('const helper = async () => await hidden();');
    expect(modules[1].code).toContain('return (await _await(nested()))();');
  });
});
