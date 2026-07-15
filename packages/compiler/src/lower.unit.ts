import { describe, expect, test } from 'vitest';
import { parseModule } from './parse';
import type { CompilerContext } from './types';
import { analyzeModule } from './analysis';
import { discoverComponents } from './discover';
import { extractQrls } from './extract';
import { lowerComponent } from './lower';
import type { ComponentPlan, ModuleAnalysis } from './plan-types';

function lower(code: string): { plan: ComponentPlan | null; analysis: ModuleAnalysis } {
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
  const analysis = analyzeModule(ctx.program!);
  const extracted = extractQrls(ctx.program!, input.path, analysis);
  const [component] = discoverComponents(ctx.program!, analysis);
  expect(component).toBeDefined();
  return {
    plan: lowerComponent(component!, extracted, analysis),
    analysis,
  };
}

describe('lowerComponent', () => {
  test('returns only a validated target-neutral ComponentPlan', () => {
    const { plan } = lower(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <button title={count.value}>{count.value}</button>;
}`);

    expect(plan).not.toBeNull();
    expect(plan?.render.roots[0]).toMatchObject({
      kind: 'element',
      tag: 'button',
      children: [{ kind: 'dynamic-value' }],
    });
    expect(plan).not.toHaveProperty('componentPlan');
    expect(plan).not.toHaveProperty('html');
    expect(plan).not.toHaveProperty('ops');
    expect(plan).not.toHaveProperty('refs');
  });

  test('retains all syntax ranges and the exported symbol on SegmentPlan', () => {
    const code = `export function App() {
  return <button onClick$={async (event) => await event.preventDefault()}>Save</button>;
}`;
    const { plan } = lower(code);
    const segment = plan?.segments.find((candidate) => candidate.kind === 'event');

    expect(segment).toMatchObject({
      symbolName: expect.any(String),
      async: true,
      bodyKind: 'expression',
      propsParts: [],
      parameterBindingIds: [expect.any(Number)],
    });
    expect(code.slice(segment!.functionRange[0], segment!.functionRange[1])).toContain(
      'async (event)'
    );
    expect(code.slice(segment!.paramRanges[0][0], segment!.paramRanges[0][1])).toBe('event');
    expect(code.slice(segment!.bodyRange[0], segment!.bodyRange[1])).toBe(
      'await event.preventDefault()'
    );
  });

  test.each([
    `import { useContextProvider } from '@qwik.dev/core';
export function App() { useContextProvider(Context, value); return <p />; }`,
    `import { useContextProvider as provide } from '@qwik.dev/core';
export function App() { provide(Context, value); return <p />; }`,
    `import * as qwik from '@qwik.dev/core';
export function App() { qwik.useContextProvider(Context, value); return <p />; }`,
  ])('records context provision by imported binding identity', (code) => {
    expect(lower(code).plan?.providesContext).toBe(true);
  });

  test('ignores shadowed and nested context-provider calls', () => {
    expect(
      lower(`import { useContextProvider } from '@qwik.dev/core';
export function App(useContextProvider) {
  useContextProvider(Context, value);
  return <p />;
}`).plan?.providesContext
    ).toBe(false);
    expect(
      lower(`import { useContextProvider } from '@qwik.dev/core';
export function App() {
  const setup = () => useContextProvider(Context, value);
  return <p />;
}`).plan?.providesContext
    ).toBe(false);
  });

  test('rejects a ComponentPlan that violates render-function lifecycle ownership', () => {
    const { plan } = lower(`import { useTask$ } from '@qwik.dev/core';
export function App({ items }) {
  return <ul>{items.map((item) => {
    useTask$(() => item.prepare());
    return <li>{item.label}</li>;
  })}</ul>;
}`);

    expect(plan).toBeNull();
  });
});
