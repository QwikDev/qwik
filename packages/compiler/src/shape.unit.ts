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
    `export function App(flag) { for (const x of flag) { return <main />; } return <aside />; }`,
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

  test('shapes a return inside an if as a guard branch', () => {
    const code = `export function App(props) {
  if (props.missing) {
    return <p>gone</p>;
  }
  return <main />;
}`;
    const [shape] = shapes(code);
    expect(shape.kind).toBe('success');
    if (shape.kind === 'success') {
      expect(shape.shape.guard).not.toBeNull();
      expect(shape.shape.guard!.then.exit.kind).toBe('return');
      expect(shape.shape.guard!.else.exit.kind).toBe('return');
      expect(code.slice(...shape.shape.guard!.condition)).toBe('props.missing');
    }
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

  test('an exported function passing JSX to a call keeps its signature', async () => {
    const code = `import { Root } from './root';
declare function renderToStream(root: any, opts: any): Promise<void>;
export default function (opts: any) {
  return renderToStream(<Root />, opts);
}`;
    const result = await transform(code);
    expect(result.diagnostics).toEqual([]);
    const main = result.modules.find((module) => module.path.endsWith('component.tsx'));
    const line = main!.code.split('\n').find((l) => l.includes('export default'));
    // the caller is outside the compiler: the arity must not change
    expect(line).not.toContain('ctx');
    // the entry runs before any invoke context exists; the render must defer into the call
    const body = main!.code.slice(main!.code.indexOf('export default'));
    expect(body).toContain('renderToStream((() =>');
    const preludeAt = body.indexOf('getActiveInvokeContext()');
    const closureAt = body.indexOf('renderToStream(');
    expect(preludeAt).toBeGreaterThan(closureAt);
  });

  test('an exported function returning JSX directly stays a component', async () => {
    const code = `export function App() {
  return <main>hi</main>;
}`;
    const result = await transform(code);
    expect(result.diagnostics).toEqual([]);
    const main = result.modules.find((module) => module.path.endsWith('component.tsx'));
    expect(main!.code).toContain('function App(');
    expect(main!.code).toMatch(/function App\(props\d*, ctx\d*\)/);
  });

  test('module-level JSX passed to a call lowers as a deferred root', async () => {
    const code = `import { render } from '@qwik.dev/core';
import { Root } from './root';
render(document, <Root />);`;
    for (const isServer of [false, true]) {
      const result = await transformModules({
        input: [{ path: 'src/entry.dev.tsx', code }],
        srcDir: 'src',
        sourceMaps: false,
        transpileTs: true,
        transpileJsx: true,
        isServer,
      });
      expect(result.diagnostics).toEqual([]);
      const main = result.modules.find((module) => module.path.endsWith('entry.dev.tsx'));
      expect(main!.code).toContain('render(document, (() =>');
    }
  });

  test('module-level JSX outside a call stays refused', async () => {
    const code = `const banner = <div>hello</div>;
export { banner };`;
    const result = await transformModules({
      input: [{ path: 'src/banner.tsx', code }],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'unsupported-runtime-jsx',
    ]);
  });

  test('a segment writing a module binding keeps its implementation in the origin', async () => {
    const code = `import { $ } from '@qwik.dev/core';
let runCount = 0;
export const handler = $(() => {
  return ++runCount;
});`;
    const result = await transformModules({
      input: [{ path: 'src/loader.ts', code }],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: false,
      isServer: true,
    });
    expect(result.diagnostics).toEqual([]);
    const origin = result.modules.find((module) => module.path.endsWith('loader.ts'));
    const chunk = result.modules.find((module) => module.path.includes('_segment_'));
    // the write happens in the scope that owns the binding; the chunk only forwards
    expect(origin!.code).toContain('++runCount');
    expect(chunk!.code).toMatch(/^export \{ [\w$]+ \} from "\.\/loader";\n$/);
  });

  test('allows an exported string helper to use the normal transform path', async () => {
    const result = await transform(`export function FormatName(value) { return String(value); }`);

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0].code).not.toBe('');
  });
});
