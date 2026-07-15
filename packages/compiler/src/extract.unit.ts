import { describe, expect, test } from 'vitest';
import { parseModule } from './parse';
import type { CompilerContext } from './types';
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
    diagnostics: [],
  };
  parseModule(ctx);
  expect(ctx.diagnostics).toEqual([]);
  return extractQrls(ctx.program!, input.path);
}

describe('extractQrls', () => {
  test('extracts source-ordered DOM props groups with nested event segments', () => {
    const extracted = extractInput(`import { useSignal } from '@qwik.dev/core';
export function App({ attrs, label }) {
  const count = useSignal(0);
  return <button disabled {...attrs.value} title={\`label \${label.value}\`} onClick$={() => count.value++} />;
}`);
    const props = extracted.segments.find((segment) => segment.ctxName === 'props');
    const event = extracted.segments.find((segment) => segment.kind === 'event');

    expect(props).toMatchObject({
      kind: 'expression',
      propsParts: [
        { kind: 'static', prop: { name: 'disabled', value: true } },
        { kind: 'spread' },
        { kind: 'expression', name: 'title' },
        { kind: 'expression', name: 'onClick$' },
      ],
      captures: [{ name: 'attrs' }, { name: 'label' }, { name: 'count' }],
    });
    expect(event).toMatchObject({ parentId: props?.id, captures: [{ name: 'count' }] });
  });

  test('extracts an event handler with a local capture', () => {
    const extracted = extractInput(`import { useSignal } from '@qwik.dev/core';
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
    expect(extracted.segments[0].captures).toEqual([
      { bindingId: expect.any(Number), name: 'row', source: 'loop' },
    ]);
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

    expect(extracted.segments[0].captures).toEqual([
      { bindingId: expect.any(Number), name: 'props', source: 'param' },
    ]);
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
    const extracted = extractInput(`import { useSignal, useTask$ } from '@qwik.dev/core';
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
    const extracted = extractInput(`import { useTask$ as task } from '@qwik.dev/core';
export function App() {
  task(() => console.log('run'));
  return <p>Task</p>;
}
`);

    expect(extracted.segments).toHaveLength(1);
    expect(extracted.segments[0]).toMatchObject({
      name: 'component_useTask$_segment_0',
      ctxName: 'useTask$',
      qrl: {
        kind: 'implicit',
        markerLocalName: 'task',
        baseName: 'useTask',
        source: '@qwik.dev/core',
        role: 'task',
      },
    });
  });

  test('recognizes third-party dollar imports without assigning Qwik hook semantics', () => {
    const extracted = extractInput(`import { useTask$ } from 'third-party-library';
export function App() {
  useTask$(() => console.log('run'));
  return <p>Task</p>;
}
`);

    expect(extracted.segments).toHaveLength(1);
    expect(extracted.segments[0]).toMatchObject({
      ctxName: 'useTask$',
      qrl: {
        kind: 'implicit',
        baseName: 'useTask',
        source: 'third-party-library',
        role: 'generic',
      },
    });
  });

  test('recognizes exported local dollar bindings', () => {
    const extracted = extractInput(`export const local$ = (value) => value;
export const local = (value) => value;
export const localQrl = (value) => value;
export function App() {
  local$(() => 1);
  return <p>Local</p>;
}
`);

    expect(extracted.segments).toHaveLength(1);
    expect(extracted.segments[0]).toMatchObject({
      qrl: { kind: 'implicit', baseName: 'local', source: null, role: 'generic' },
    });
  });

  test('ignores non-exported locals, defaults, namespaces, type-only imports, and shadows', () => {
    const extracted = extractInput(`import default$ from 'default-marker';
import * as markers from 'namespace-marker';
import type { typed$ } from 'type-marker';
import { external$ } from 'external-marker';

const local$ = (value) => value;
export function App(external$) {
  default$(() => 1);
  markers.member$(() => 2);
  typed$(() => 3);
  local$(() => 4);
  external$(() => 5);
  return <p>Ignored</p>;
}
`);

    expect(extracted.segments).toEqual([]);
  });

  test('propagates nested qrl captures to its parent segment', () => {
    const extracted = extractInput(`import { useSignal, useTask$ } from '@qwik.dev/core';
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

  test('does not capture bindings owned by a nested non-QRL function', () => {
    const extracted = extractInput(`export function App() {
  const outer = 1;
  return <button onClick$={() => {
    function inner(value) {
      return value + outer;
    }
    return inner(1);
  }}>Run</button>;
}
`);

    expect(extracted.segments).toHaveLength(1);
    expect(extracted.segments[0].captures).toEqual([
      { bindingId: expect.any(Number), name: 'outer', source: 'local' },
    ]);
  });

  test('keeps a parent-segment local out of the parent capture list', () => {
    const extracted = extractInput(`import { $, useSignal, useTask$ } from '@qwik.dev/core';
export function App() {
  useTask$(() => {
    const local = useSignal(0);
    return $(() => local.value);
  });
  return <main />;
}
`);

    expect(extracted.segments).toHaveLength(2);
    expect(extracted.segments[0].captures).toEqual([]);
    expect(extracted.segments[1].captures).toEqual([
      { bindingId: expect.any(Number), name: 'local', source: 'local' },
    ]);
  });

  test('records await expressions on their owning qrl', () => {
    const code = `import { $ } from '@qwik.dev/core';
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
  });

  test('preserves analysis binding IDs and reference roles on segments', () => {
    const extracted = extractInput(`const save = (value) => value;
export function App(props) {
  return <button onClick$={() => save(props.value)}>Save</button>;
}
`);
    const [segment] = extracted.segments;
    const props = extracted.analysis.bindings.find((binding) => binding.name === 'props');
    const save = extracted.analysis.bindings.find((binding) => binding.name === 'save');

    expect(segment.captures[0].bindingId).toBe(props?.id);
    expect(segment.moduleReferenceBindingIds).toEqual([save?.id]);
    expect(segment.references).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bindingId: save?.id, role: 'call' }),
        expect.objectContaining({ bindingId: props?.id, role: 'read' }),
      ])
    );
  });

  test('normalizes visible task strategies from the options AST', () => {
    const extracted = extractInput(`import { useVisibleTask$ } from '@qwik.dev/core';
export function App() {
  useVisibleTask$(() => 1);
  useVisibleTask$(() => 2, { strategy: 'document-ready' });
  useVisibleTask$(() => 3, { 'strategy': 'document-idle' });
  return <main />;
}
`);

    expect(extracted.segments.map((segment) => segment.visibleTaskStrategy)).toEqual([
      'intersection-observer',
      'document-ready',
      'document-idle',
    ]);
  });
});
