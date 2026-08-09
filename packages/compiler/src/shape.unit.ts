import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { transformModules } from './index';
import { analyzeModule } from './analysis';
import { TransformDiagnosticCode } from './transform-diagnostics';
import { discoverComponentCandidates } from './discover';
import { analyzeComponentShape } from './shape';

function shapes(code: string) {
  const parsed = parseSync('src/component.tsx', code, {
    lang: 'tsx',
    sourceType: 'module',
    astType: 'ts',
    range: true,
  });
  expect(parsed.errors).toEqual([]);
  const analysis = analyzeModule(parsed.program);
  return discoverComponentCandidates(parsed.program, analysis).map((candidate) =>
    analyzeComponentShape(candidate.fn, candidate.plan.bindingId, analysis)
  );
}

async function transform(code: string) {
  const input = { path: 'src/component.tsx', code };
  return transformModules({
    input: [input],
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer: true,
  });
}

describe('ComponentShape', () => {
  test('keeps async, object parameter bindings, setup, and the direct return range', () => {
    const code = `export async function widget({ label: text = 'label', ...rest } = {}) {
  const value = text + String(rest);
  return <main>{value}</main>;
}`;
    const [result] = shapes(code);

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.shape.async).toBe(true);
      expect(result.shape.parameter?.kind).toBe('object');
      expect(result.shape.parameter?.bindingIds).toHaveLength(2);
      expect(result.shape.setup).toHaveLength(1);
      expect(code.slice(...result.shape.returnExpression)).toBe('<main>{value}</main>');
    }
  });

  test('accepts expression-bodied components', () => {
    const [result] = shapes(`export const widget = (props) => <main>{props.value}</main>;`);

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.shape.parameter?.kind).toBe('identifier');
      expect(result.shape.setup).toEqual([]);
    }
  });

  test.each([
    `export function App(a, b) { return <main />; }`,
    `export function App([value]) { return <main>{value}</main>; }`,
    `export function App(flag) { if (flag) return <main />; return <aside />; }`,
    `export function App() { return <main />; sideEffect(); }`,
  ])('fails a qualified unsupported shape atomically', async (code) => {
    const result = await transform(code);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      TransformDiagnosticCode.UnsupportedComponentShape,
    ]);
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].code).toBe('');
  });

  test('allows an if statement of plain computation in setup', () => {
    const code = `export function App(props) {
  let mode = 'view';
  if (props.editing) {
    mode = 'edit';
  } else {
    mode = 'view';
  }
  return <main>{mode}</main>;
}`;
    const [shape] = shapes(code);
    expect(shape.kind).toBe('success');
  });

  test('rejects a hook call inside an if, naming the hook', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App(props) {
  if (props.fancy) {
    const extra = useSignal(0);
  }
  return <main />;
}`;
    const [shape] = shapes(code);
    expect(shape.kind).toBe('failure');
    expect((shape as { message: string }).message).toContain('conditionally');
  });

  test('rejects a return inside an if as a conditional render', () => {
    const code = `export function App(props) {
  if (props.missing) {
    return <p>gone</p>;
  }
  return <main />;
}`;
    const [shape] = shapes(code);
    expect(shape.kind).toBe('failure');
    expect((shape as { message: string }).message).toContain('render');
  });

  test('rejects JSX inside an if in setup', () => {
    const code = `export function App(props) {
  let content = null;
  if (props.show) {
    content = <p>hi</p>;
  }
  return <main>{content}</main>;
}`;
    const [shape] = shapes(code);
    expect(shape.kind).toBe('failure');
  });

  test('rejects a $ boundary inside an if in setup', () => {
    const code = `import { $ } from '@qwik.dev/core';
export function App(props) {
  let handler = null;
  if (props.active) {
    handler = $(() => 1);
  }
  return <main />;
}`;
    const [shape] = shapes(code);
    expect(shape.kind).toBe('failure');
  });

  test('allows an exported string helper to use the normal transform path', async () => {
    const result = await transform(`export function FormatName(value) { return String(value); }`);

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0].code).not.toBe('');
  });
});
