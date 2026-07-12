import { describe, expect, test } from 'vitest';
import { parseModule } from '../stages/parse';
import type { CompilerContext } from '../types';
import { discoverRewriteComponents } from './discover';
import { extractQrls } from './extract';
import { createChildRefPath, lowerRewriteComponent } from './lower';
import type { RenderResult } from './types';

function lowerInput(code: string): { code: string; result: RenderResult | null } {
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
    manifest: {
      components: [],
      segments: [],
      imports: [],
      diagnostics: [],
    },
    outputModules: null,
  };
  parseModule(ctx);
  expect(ctx.manifest.diagnostics).toEqual([]);
  expect(ctx.program).not.toBeNull();
  const extractedQrls = extractQrls(ctx.program!, input.path);
  const [component] = discoverRewriteComponents(ctx.program!, extractedQrls.componentReferences);
  expect(component).not.toBeUndefined();
  return { code, result: lowerRewriteComponent(component!, extractedQrls) };
}

function lowerTextOp(code: string) {
  const lowered = lowerInput(code);
  expect(lowered.result?.ops).toHaveLength(1);
  const op = lowered.result?.ops[0];
  expect(op?.kind).toBe('textEffect');
  if (op?.kind !== 'textEffect') {
    throw new Error('Expected textEffect op');
  }
  return { ...lowered, op };
}

function expectTextSource(code: string, op: ReturnType<typeof lowerTextOp>['op'], value: string) {
  expect(op.binding.kind).toBe('source');
  if (op.binding.kind !== 'source') {
    throw new Error('Expected source text binding');
  }
  expect(code.slice(op.binding.range[0], op.binding.range[1])).toBe(value);
}

describe('rewrite ref paths', () => {
  test('chooses the shortest sibling path', () => {
    expect(createChildRefPath({ childIndex: 0, siblingCount: 4 })).toEqual(['firstChild']);
    expect(createChildRefPath({ childIndex: 1, siblingCount: 4 })).toEqual([
      'firstChild',
      'nextSibling',
    ]);
    expect(createChildRefPath({ childIndex: 2, siblingCount: 4 })).toEqual([
      'lastChild',
      'previousSibling',
    ]);
    expect(createChildRefPath({ childIndex: 3, siblingCount: 4 })).toEqual(['lastChild']);
  });
});

describe('lowerRewriteComponent', () => {
  test('renders direct fragment children as top-level roots', () => {
    const { result } = lowerInput(`export function App() {
  return (
    <>
      <h1>Hello</h1>
      <>
        <p>Qwik</p>
      </>
    </>
  );
}
`);

    expect(result?.html).toEqual([
      { kind: 'html', value: '<h1' },
      { kind: 'html', value: '>' },
      { kind: 'html', value: 'Hello' },
      { kind: 'html', value: '</h1>' },
      { kind: 'html', value: '<p' },
      { kind: 'html', value: '>' },
      { kind: 'html', value: 'Qwik' },
      { kind: 'html', value: '</p>' },
    ]);
    expect(result?.roots).toEqual([0, 1]);
    expect(result?.refs).toEqual([
      { id: 0, path: ['firstChild'] },
      { id: 1, path: ['lastChild'] },
    ]);
  });

  test('flattens nested fragments inside elements', () => {
    const { result } = lowerInput(`export function App() {
  return <main><><span>First</span><span>Second</span></></main>;
}
`);

    expect(result?.html).toEqual([
      { kind: 'html', value: '<main' },
      { kind: 'html', value: '>' },
      { kind: 'html', value: '<span' },
      { kind: 'html', value: '>' },
      { kind: 'html', value: 'First' },
      { kind: 'html', value: '</span>' },
      { kind: 'html', value: '<span' },
      { kind: 'html', value: '>' },
      { kind: 'html', value: 'Second' },
      { kind: 'html', value: '</span>' },
      { kind: 'html', value: '</main>' },
    ]);
  });

  test('keeps nested JSX inside its root element', () => {
    const { result } = lowerInput(`export function App() {
  return <main><span>Inner</span></main>;
}
`);

    expect(result?.html).toEqual([
      { kind: 'html', value: '<main' },
      { kind: 'html', value: '>' },
      { kind: 'html', value: '<span' },
      { kind: 'html', value: '>' },
      { kind: 'html', value: 'Inner' },
      { kind: 'html', value: '</span>' },
      { kind: 'html', value: '</main>' },
    ]);
    expect(result?.refs).toEqual([{ id: 0, path: ['firstChild'] }]);
  });

  test('does not treat callback JSX as a component return root', () => {
    const { code, result } = lowerInput(`export function App() {
  const render = () => <span>Ignored</span>;
  return <main>Visible</main>;
}
`);

    expect(result?.html).toEqual([
      { kind: 'html', value: '<main' },
      { kind: 'html', value: '>' },
      { kind: 'html', value: 'Visible' },
      { kind: 'html', value: '</main>' },
    ]);
    expect(result?.setup.map((range) => code.slice(range[0], range[1]))).toEqual([
      'const render = () => <span>Ignored</span>;',
    ]);
    expect(result?.refs).toEqual([{ id: 0, path: ['firstChild'] }]);
  });

  test('records dynamic text markers and source-backed setup', () => {
    const { code, result, op } = lowerTextOp(`import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  return <button>{count.value}</button>;
}
`);

    expect(result?.html).toEqual([
      { kind: 'html', value: '<button' },
      { kind: 'html', value: '>' },
      { kind: 'marker', id: 1 },
      { kind: 'html', value: '</button>' },
    ]);
    expect(result?.roots).toEqual([0]);
    expect(result?.refs).toEqual([
      { id: 0, path: ['firstChild'] },
      { id: 1, path: ['firstChild', 'firstChild'] },
    ]);
    expect(result?.ops).toHaveLength(1);
    expect(op.target).toEqual({ kind: 'element', id: 0, marker: 1 });
    expect(result?.setup.map((range) => code.slice(range[0], range[1]))).toEqual([
      'const count = useSignal(0);',
    ]);
    expect(code.slice(op.expr[0], op.expr[1])).toBe('count.value');
    expectTextSource(code, op, 'count');
  });

  test.each(['useSignal', 'useComputed$', 'useAsync$', 'useSerializer$'])(
    'tracks %s sources imported from QWIK_IMPORT',
    (factory) => {
      const { code, op } = lowerTextOp(`import { ${factory} } from '@qwik.dev/core/spark';
export function App() {
  const count = ${factory}(0);
  return <button>{count.value}</button>;
}
`);

      expectTextSource(code, op, 'count');
    }
  );

  test('tracks aliased source factory imports', () => {
    const { code, op } = lowerTextOp(`import { useSignal as signal } from '@qwik.dev/core/spark';
export function App() {
  const count = signal(0);
  return <button>{count.value}</button>;
}
`);

    expectTextSource(code, op, 'count');
  });

  test('tracks namespace source factory imports', () => {
    const { code, op } = lowerTextOp(`import * as spark from '@qwik.dev/core/spark';
export function App() {
  const count = spark.useSignal(0);
  return <button>{count.value}</button>;
}
`);

    expectTextSource(code, op, 'count');
  });

  test('does not track plain value objects', () => {
    const { code, op } = lowerTextOp(`export function App() {
  const count = { value: 'x' };
  return <button>{count.value}</button>;
}
`);

    expect(code.slice(op.expr[0], op.expr[1])).toBe('count.value');
    expect(op.binding.kind).toBe('expression');
  });

  test('does not track source factories imported from other modules', () => {
    const { op: coreOp } = lowerTextOp(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <button>{count.value}</button>;
}
`);
    const { op: localOp } = lowerTextOp(`import { useSignal } from './signals';
export function App() {
  const count = useSignal(0);
  return <button>{count.value}</button>;
}
`);

    expect(coreOp.binding.kind).toBe('expression');
    expect(localOp.binding.kind).toBe('expression');
  });

  test('does not track shadowed source factory imports', () => {
    const { op: localOp } = lowerTextOp(`import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const useSignal = () => ({ value: 0 });
  const count = useSignal(0);
  return <button>{count.value}</button>;
}
`);
    const { op: paramOp } = lowerTextOp(`import { useSignal } from '@qwik.dev/core/spark';
export function App(useSignal) {
  const count = useSignal(0);
  return <button>{count.value}</button>;
}
`);

    expect(localOp.binding.kind).toBe('expression');
    expect(paramOp.binding.kind).toBe('expression');
  });

  test.each([
    [
      'named',
      `import { useContextProvider } from '@qwik.dev/core/spark';
export function App() {
  useContextProvider(Context, value);
  return <p>Provided</p>;
}
`,
    ],
    [
      'aliased',
      `import { useContextProvider as provide } from '@qwik.dev/core/spark';
export function App() {
  provide(Context, value);
  return <p>Provided</p>;
}
`,
    ],
    [
      'namespace',
      `import * as spark from '@qwik.dev/core/spark';
export function App() {
  spark.useContextProvider(Context, value);
  return <p>Provided</p>;
}
`,
    ],
  ])('records context provider calls from %s imports', (_name, code) => {
    const { result } = lowerInput(code);

    expect(result?.providesContext).toBe(true);
  });

  test('does not record shadowed or nested context provider imports', () => {
    const { result: paramShadow } =
      lowerInput(`import { useContextProvider } from '@qwik.dev/core/spark';
export function App(useContextProvider) {
  useContextProvider(Context, value);
  return <p>Provided</p>;
}
`);
    const { result: nestedCallback } =
      lowerInput(`import { useContextProvider } from '@qwik.dev/core/spark';
export function App() {
  const setup = () => useContextProvider(Context, value);
  return <p>Provided</p>;
}
`);

    expect(paramShadow?.providesContext).toBe(false);
    expect(nestedCallback?.providesContext).toBe(false);
  });

  test('keeps expression text ops without direct tracked source', () => {
    const { code, op } = lowerTextOp(`import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  return <button>{count.value + 1}</button>;
}
`);

    expect(code.slice(op.expr[0], op.expr[1])).toBe('count.value + 1');
    expect(op.binding.kind).toBe('expression');
  });

  test('does not direct-track computed value access yet', () => {
    const { code, op } = lowerTextOp(`import { useSignal } from '@qwik.dev/core/spark';
export function App() {
  const count = useSignal(0);
  return <button>{count['value']}</button>;
}
`);

    expect(code.slice(op.expr[0], op.expr[1])).toBe("count['value']");
    expect(op.binding.kind).toBe('expression');
  });
});
