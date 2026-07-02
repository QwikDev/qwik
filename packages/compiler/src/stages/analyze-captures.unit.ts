import { describe, expect, test } from 'vitest';
import type { TransformModuleInput, TransformModulesOptions } from '@qwik.dev/optimizer';
import { analyzeCaptures } from './analyze-captures';
import { collectModuleFacts, discoverExportedComponents } from './discover';
import { parseModule } from './parse';
import type { CompilerContext, SegmentRecord } from '../types';

interface TestInput {
  code: string;
  path?: string;
}

const baseOptions = (input: TransformModuleInput): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
});

function analyzeInput(input: TestInput): CompilerContext {
  const moduleInput = {
    path: input.path ?? 'src/component.tsx',
    code: input.code,
  };
  const ctx: CompilerContext = {
    input: moduleInput,
    options: baseOptions(moduleInput),
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
  collectModuleFacts(ctx);
  discoverExportedComponents(ctx);
  analyzeCaptures(ctx);
  expect(ctx.manifest.diagnostics).toEqual([]);
  return ctx;
}

function captureNames(segment: SegmentRecord | undefined) {
  return segment?.captures.map((capture) => capture.name) ?? [];
}

describe('analyzeCaptures', () => {
  test('does not create segments for plain exported components', () => {
    const ctx = analyzeInput({
      code: `export function App() {
  return <div>Plain</div>;
}
`,
    });

    expect(ctx.manifest.segments).toEqual([]);
    expect(ctx.manifest.components[0].segmentId).toBe(null);
  });

  test('creates component$ segments without capturing module-level bindings', () => {
    const ctx = analyzeInput({
      code: `import { component$ } from '@qwik.dev/core';
const greeting = 'Hello';
export const App = component$(() => <p>{greeting}</p>);
`,
    });

    const componentSegment = ctx.manifest.segments.find(
      (segment) => segment.ctxName === 'component$'
    );
    const textSegment = ctx.manifest.segments.find((segment) => segment.ctxName === 'text');

    expect(ctx.manifest.segments).toHaveLength(2);
    expect(componentSegment?.captures).toEqual([]);
    expect(textSegment?.kind).toBe('jsxText');
    expect(textSegment?.captures).toEqual([]);
    expect(ctx.manifest.components[0].segmentId).toBe(componentSegment?.id);
  });

  test('captures parent params and locals from inline event handlers', () => {
    const ctx = analyzeInput({
      code: `export function App(props) {
  const state = useSignal(0);
  const local = props.name;
  return <button onClick$={(ev) => {
    console.log(props.name, state.value, local, ev.currentTarget);
    const inside = 1;
    console.log(inside);
  }} />;
}
`,
    });

    const event = ctx.manifest.segments.find((segment) => segment.ctxName === 'onClick$');
    expect(event?.kind).toBe('eventHandler');
    expect(captureNames(event)).toEqual(['props', 'state', 'local']);
  });

  test('handles shadowing and member expression references', () => {
    const ctx = analyzeInput({
      code: `export function App(props) {
  const key = 'name';
  const obj = props.obj;
  return <button onClick$={() => {
    const props = { name: 'local' };
    console.log(obj.foo, obj[key], props.name);
  }} />;
}
`,
    });

    const event = ctx.manifest.segments.find((segment) => segment.ctxName === 'onClick$');
    expect(captureNames(event)).toEqual(['obj', 'key']);
  });

  test('collects destructured bindings as captures', () => {
    const ctx = analyzeInput({
      code: `export function App({ user }, [selected]) {
  const { first: firstName, last = '' } = user;
  return <button onClick$={() => console.log(user, selected, firstName, last)} />;
}
`,
    });

    const event = ctx.manifest.segments.find((segment) => segment.ctxName === 'onClick$');
    expect(captureNames(event)).toEqual(['user', 'selected', 'firstName', 'last']);
  });

  test('marks iteration callback params captured by handlers as loop captures', () => {
    const ctx = analyzeInput({
      code: `export function App() {
  const items = [1];
  return <>{items.map((item, index) => <button onClick$={() => console.log(item, index)} />)}</>;
}
`,
    });

    const event = ctx.manifest.segments.find((segment) => segment.ctxName === 'onClick$');
    expect(captureNames(event)).toEqual(['item', 'index']);
    expect(event?.captures.map((capture) => capture.source)).toEqual(['loop', 'loop']);
  });

  test('skips JSX source segments for namespace-imported Spark sources', () => {
    const ctx = analyzeInput({
      code: `import * as spark from '@qwik.dev/core/spark';

export function App() {
  const count = spark.useSignal(0);
  return <p title={count.value}>{count.value}</p>;
}
`,
    });

    expect(ctx.manifest.segments).toEqual([]);
    expect(ctx.manifest.components[0].knownSourceNames).toEqual(['count']);
  });

  test('creates JSX expression segments for source aliases', () => {
    const ctx = analyzeInput({
      code: `import { useSignal } from '@qwik.dev/core/spark';

export function App() {
  const count = useSignal(0);
  const alias = count;
  return <p title={alias.value}>{alias.value}</p>;
}
`,
    });

    expect(ctx.manifest.segments.map((segment) => `${segment.kind}:${segment.ctxName}`)).toEqual([
      'jsxProp:title',
      'jsxText:text',
    ]);
    expect(ctx.manifest.components[0].knownSourceNames).toEqual(['count']);
  });

  test('does not trust shadowed Spark source factories', () => {
    const ctx = analyzeInput({
      code: `import { useSignal } from '@qwik.dev/core/spark';

export function App() {
  const useSignal = () => ({ value: 0 });
  const count = useSignal();
  return <p>{count.value}</p>;
}
`,
    });

    expect(ctx.manifest.segments.map((segment) => `${segment.kind}:${segment.ctxName}`)).toEqual([
      'jsxText:text',
    ]);
    expect(ctx.manifest.components[0].knownSourceNames).toEqual([]);
  });

  test('keeps nested QRL captures isolated from parent handler captures', () => {
    const ctx = analyzeInput({
      code: `export function App(props) {
  const outer = 1;
  return <button onClick$={() => {
    const inner = 2;
    useTask$(() => console.log(props.name, inner));
    console.log(outer);
  }} />;
}
`,
    });

    const event = ctx.manifest.segments.find((segment) => segment.ctxName === 'onClick$');
    const task = ctx.manifest.segments.find((segment) => segment.ctxName === 'useTask$');
    expect(captureNames(event)).toEqual(['outer']);
    expect(captureNames(task)).toEqual(['props', 'inner']);
  });

  test('does not capture locals from nested non-QRL functions', () => {
    const ctx = analyzeInput({
      code: `export function App() {
  const outer = 1;
  return <button onClick$={() => {
    function inner(value) {
      return value + outer;
    }
    return inner(1);
  }} />;
}
`,
    });

    const event = ctx.manifest.segments.find((segment) => segment.ctxName === 'onClick$');
    expect(captureNames(event)).toEqual(['outer']);
  });

  test('hoists var declarations from nested blocks before capture analysis', () => {
    const ctx = analyzeInput({
      code: `export function App() {
  return <button onClick$={() => console.log(value)} />;
  if (Math.random()) {
    var value = 1;
  }
}
`,
    });

    const event = ctx.manifest.segments.find((segment) => segment.ctxName === 'onClick$');
    expect(captureNames(event)).toEqual(['value']);
  });

  test('does not leak class static block bindings into parent scope', () => {
    const ctx = analyzeInput({
      code: `export function App() {
  class Helper {
    static {
      const hidden = 1;
    }
  }
  return <button onClick$={() => console.log(hidden)} />;
}
`,
    });

    const event = ctx.manifest.segments.find((segment) => segment.ctxName === 'onClick$');
    expect(captureNames(event)).toEqual([]);
  });

  test('does not leak class expression names into parent scope', () => {
    const ctx = analyzeInput({
      code: `export function App() {
  const Helper = class Hidden {};
  return <button onClick$={() => console.log(Hidden)} />;
}
`,
    });

    const event = ctx.manifest.segments.find((segment) => segment.ctxName === 'onClick$');
    expect(captureNames(event)).toEqual([]);
  });

  test('preserves explicit inlinedQrl captures', () => {
    const ctx = analyzeInput({
      code: `export function App() {
  const a = 1;
  const b = 2;
  inlinedQrl(() => console.log(a, b), 'App_inlined', [a, b]);
  return <div />;
}
`,
    });

    const qrl = ctx.manifest.segments.find((segment) => segment.ctxName === 'inlinedQrl');
    expect(qrl?.captureMode).toBe('explicit');
    expect(captureNames(qrl)).toEqual(['a', 'b']);
  });
});
