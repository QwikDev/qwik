import { describe, expect, test } from 'vitest';
import { parseModule } from './parse';
import type { CompilerContext } from './types';
import { analyzeModule } from './analysis';
import { discoverComponents } from './discover';
import { emitCsrPlan, emitCsrSegmentRender } from './emit-csr';
import { extractQrls } from './extract';
import { lowerComponent } from './lower';
import { planCsr } from './plan-csr';
import type { ComponentPlan, ModuleAnalysis } from './plan-types';

function lower(code: string): { plan: ComponentPlan; analysis: ModuleAnalysis } {
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
    emitTarget: 'csr',
    program: null,
    diagnostics: [],
  };
  parseModule(ctx);
  expect(ctx.diagnostics).toEqual([]);
  const analysis = analyzeModule(ctx.program!);
  const extracted = extractQrls(ctx.program!, input.path, analysis);
  const [component] = discoverComponents(ctx.program!, analysis);
  expect(component).toBeDefined();
  const plan = lowerComponent(component!, extracted, analysis);
  expect(plan).not.toBeNull();
  return { plan: plan!, analysis };
}

describe('planCsr', () => {
  test('plans final template paths and batches scalar operations with the same captures', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <button class="primary" title={count.value}>Count: {count.value}</button>;
}`;
    const component = lower(code).plan;
    const plan = planCsr(component, code)!;

    expect(plan.template).toBe('<button class="primary">Count: <!----></button>');
    expect(plan.refs).toEqual([
      { id: 0, kind: 'element', path: ['firstChild'] },
      { id: 1, kind: 'text', path: ['firstChild', 'firstChild'] },
      {
        id: 2,
        kind: 'text-marker',
        path: ['firstChild', 'firstChild', 'nextSibling'],
      },
    ]);
    expect(plan.operations.map((operation) => operation.kind)).toEqual(['attribute', 'text']);

    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;
    const output = [...emitted.statements, emitted.value].join('\n');
    expect(output).toContain('const el0 = _first(fragment0);');
    expect(output).toContain('const marker0 = _next(_first(el0));');
    expect(output).not.toContain('_first(_first(fragment0))');
    expect(output).not.toContain('await ');
    expect(output).toContain("const text0 = ctx.document.createTextNode('');");
    expect(output).not.toContain('let text0;');
    expect(output).toContain('createDomBatchEffect');
    expect(output).not.toContain('runDomBatchEffect');
    expect(output).not.toContain('.run()');
    expect(output).not.toContain('Promise.all([');
    expect(output).not.toContain('scheduler.notify(effect0)');
    expect(output).not.toContain('createAttrExpressionEffect');
    expect(output).not.toContain('createTextExpressionEffect');
    expect(output.indexOf('patchAttrValue')).toBeLessThan(output.indexOf('patchTextValue'));
  });

  test('does not traverse static descendants that no operation uses', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const title = useSignal('hello');
  return <main title={title.value}><section><span>static</span></section></main>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;
    const output = emitted.statements.join('\n');

    expect(output.match(/_first\(/g)).toHaveLength(1);
    expect(output).not.toContain('_next(');
  });

  test('emits one props effect for source-ordered DOM props groups', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const attrs = useSignal({ role: 'status' });
  const label = useSignal('ready');
  return <span {...attrs.value} title={\`label \${label.value}\`} />;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;
    const output = emitted.statements.join('\n');

    expect(output.match(/createPropsEffect/g)).toHaveLength(1);
    expect(output).toContain('[attrs, label]');
    expect(output).not.toContain('applyDomProps');
    expect(output).not.toContain('patchAttrValue');
  });

  test('uses the existing text node for a sole dynamic text child', () => {
    const code = `export function App({ value }) {
  return <p>{value.count}</p>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;

    expect(plan.template).toBe('<p> </p>');
    expect(emitted.statements.join('\n')).not.toContain('replaceWith');
  });

  test('gives content, component, branch, slot, and collection persistent ranges', () => {
    const code = `import { Slot } from '@qwik.dev/core';
export function App({ ok, items, render }) {
  return <main>
    {render()}
    <Card><b>projected</b></Card>
    {ok ? <i>yes</i> : <i>no</i>}
    <Slot><u>fallback</u></Slot>
    {items.map((item) => <span key={item.id}>{item.label}</span>)}
  </main>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const kinds = plan.operations.map((operation) => operation.kind);

    expect(kinds).toEqual(['content-effect', 'component', 'branch', 'slot', 'collection']);
    expect(plan.refs.filter((ref) => ref.kind === 'range-start')).toHaveLength(5);
    expect(plan.refs.filter((ref) => ref.kind === 'range-end')).toHaveLength(5);
    expect(plan.template).toContain('<main><!----><!---->');
  });

  test('keeps branch conditions direct and loads branch renderers lazily', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <main>{count.value > 2 && <p>{count.value}</p>}</main>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const branch = plan.operations.find((operation) => operation.kind === 'branch');
    expect(branch).toBeDefined();
    if (branch?.kind !== 'branch') {
      return;
    }

    expect(branch.condition.delivery).toBe('direct');
    expect(branch.then.delivery).toBe('lazy');
    expect(plan.directSegmentIds).toContain(branch.condition.segmentId);
    expect(plan.directSegmentIds).not.toContain(branch.then.segmentId);

    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;
    const output = [...emitted.hoists, ...emitted.statements, emitted.value].join('\n');

    expect(output).toContain(
      `_withCaptures(${branch.condition.symbolName}, [${branch.condition.captures.join(', ')}])`
    );
    expect(output).toContain(`q_${branch.then.symbolName}.w([${branch.then.captures.join(', ')}])`);
    expect(output).toContain(`() => import("./component.tsx_${branch.then.symbolName}")`);
    expect(output).toMatch(/ctx\.scheduler\.notify\(branch\d+\);/);
    expect(output).not.toContain('.run()');
    expect([...imports]).toContain('_qrlWithChunk');
  });

  test('uses resolved root operation values when composing fragment output', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const first = useSignal(true);
  const second = useSignal(true);
  return <>{first.value && <i>first</i>}{second.value && <b>second</b>}</>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, new Set())!;

    expect(emitted.value).toBe('[start0, end0, start1, end1]');
  });

  test('keeps local JSX factories synchronous when they only schedule subscriber work', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  const button = <button>{count.value}</button>;
  return <section>{button}</section>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const local = plan.setup.find((item) => item.kind === 'render-value');
    expect(local?.kind === 'render-value' && local.render.returnMode).toBe('sync');

    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, new Set())!;
    const output = emitted.statements.join('\n');
    expect(output).toMatch(/const content\d+ = \(button\(\)\);/);
    expect(output).not.toContain('maybeThen(');
  });

  test('gives a sole reactive content root a resumable range', () => {
    const code = `import { renderActive, renderInactive } from './renderers';
export function App(props) {
  return <main>{props.enabled ? renderActive(props.value) : renderInactive(props.value)}</main>;
}`;
    const component = lower(code).plan;
    const root = component.render.roots[0];
    expect(root).toMatchObject({ kind: 'element', children: [{ kind: 'branch' }] });
    if (root.kind !== 'element' || root.children[0].kind !== 'branch') {
      return;
    }
    const segment = component.segments.find(
      (candidate) => candidate.id === root.children[0].then.segmentId
    )!;
    const imports = new Set<string>();
    const emitted = emitCsrSegmentRender(segment, code, imports, component.segments)!;

    expect(emitted.hoists.join('\n')).toContain('createTemplate("<!----><!---->")');
    expect(emitted.statements.join('\n')).toContain('createContentBlock');
    expect(emitted.statements.join('\n')).not.toContain('.block.nodes');
    expect(emitted.statements.join('\n')).not.toContain('let range');
    expect(emitted.statements.join('\n')).toMatch(/ctx\.scheduler\.notify\(content\d+\);/);
    expect(emitted.value).toBe('[start0, end0]');
    expect(emitted.runtimeParameters).toEqual(['ctx']);
    expect([...imports]).not.toContain('_toNodes');
  });

  test('uses ContentBlock for nested dynamic content', () => {
    const code = `import { renderActive } from './renderers';
export function App(props) {
  return <main><b>before</b>{renderActive(props.value)}<i>after</i></main>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;
    const output = emitted.statements.join('\n');

    expect(output).toContain('createContentBlock(');
    expect(output).toMatch(/ctx\.scheduler\.notify\(content\d+\);/);
    expect(output).not.toContain('.run()');
    expect(output).not.toContain('_toNodes(');
    expect(output).not.toContain('let range0;');
    expect(output).not.toContain('range0 =');
    expect(output).not.toContain('.flat()');
    expect(output).not.toContain('.filter(');
    expect(output).not.toContain('createTextNode(String(');
  });

  test('passes a direct array to the collection runtime without a wrapper', () => {
    const code = `export function App({ items }) {
  return <ul>{items.map((item) => <li>{item}</li>)}</ul>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;
    const output = [...emitted.statements, emitted.value].join('\n');
    const hoists = emitted.hoists.join('\n');

    expect(hoists).not.toContain('_qrlWithChunk(');
    expect(output).not.toContain('_qrlWithChunk(');
    expect(output).not.toContain('_wrapArray(');
    expect(output).toContain('createCollection(');
    expect(output).not.toContain('ctx.scheduler.waitFor(createCollection(');
    expect(output).not.toContain('maybeThen(');
    expect(output).not.toContain('new ForRange(');
    expect(output).not.toContain('await ');
  });

  test('keeps a derived collection source when its row uses the reactive index', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a', visible: true }]);
  return <ul>{items.value.filter((item) => item.visible).map((item, index) => <li key={item.id}>{index}</li>)}</ul>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;
    const output = [...emitted.statements, emitted.value].join('\n');

    expect(output).toMatch(/_wrapArray\(q_[\w$]+\.w\(\[items\]\), true\)/);
  });

  test('emits a proven Qwik Source directly to createCollection', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a' }]);
  return <ul>{items.value.map((item) => <li key={item.id}>{item.id}</li>)}</ul>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;
    const output = [...emitted.statements, emitted.value].join('\n');

    expect(output).toContain('createCollection(');
    expect(output).toMatch(/createCollection\([^\n]+, items,/);
    expect(output).not.toContain('createForBlock(');
    expect(output).not.toContain('_wrapArray(');
    expect(output).not.toContain('_qrlWithChunk(');
    expect(output).not.toContain('maybeThen(');
    expect(output).toContain('ctx.scheduler.waitFor(createCollection(');
    expect([...imports]).toContain('createCollection');
    expect([...imports]).not.toContain('createForBlock');
  });

  test('plans a root collection result without a runtime return-nodes mode', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a' }]);
  return <>{items.value.map((item) => <li key={item.id}>{item.id}</li>)}</>;
}`;
    const plan = planCsr(lower(code).plan, code)!;
    const imports = new Set<string>();
    const emitted = emitCsrPlan('App', plan, code, 'src/component.tsx', false, imports)!;
    const output = [...emitted.statements, emitted.value].join('\n');

    expect(output).toContain('[start0, end0]');
    expect(output).not.toContain('Array.from(');
    expect(output).not.toContain("'', true");
    expect(output).not.toContain('getNodes');
  });

  test('omits unused source parameters from a static CSR row', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a' }]);
  return <ul>{items.value.map((item) => <li key={item.id}>Item</li>)}</ul>;
}`;
    const component = lower(code).plan;
    const root = component.render.roots[0];
    if (root.kind !== 'element' || root.children[0].kind !== 'collection') {
      throw new Error('Expected a collection');
    }
    const row = component.segments.find(
      (segment) => segment.id === root.children[0].row.segmentId
    )!;
    const emitted = emitCsrSegmentRender(row, code, new Set(), component.segments)!;

    expect(emitted.runtimeParameters).toEqual(['ctx']);
    expect(emitted.parameterBindingIds).toEqual([]);
  });

  test('emits nested row source values through the text effect hot path', () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([]);
  return <ul>{items.value.map((row) => <li key={row.id}>{row.label.value}</li>)}</ul>;
}`;
    const component = lower(code).plan;
    const root = component.render.roots[0];
    expect(root).toMatchObject({ kind: 'element', children: [{ kind: 'collection' }] });
    if (root.kind !== 'element' || root.children[0].kind !== 'collection') {
      return;
    }
    const row = component.segments.find(
      (segment) => segment.id === root.children[0].row.segmentId
    )!;
    const imports = new Set<string>();
    const emitted = emitCsrSegmentRender(row, code, imports, component.segments)!;
    const output = [...emitted.statements, emitted.value].join('\n');

    expect(output).toContain('createTextExpressionEffect');
    expect(output).toContain('ctx.scheduler.notify(effect0);');
    expect(output).not.toContain('.run()');
    expect(output).not.toContain('maybeThen(');
    expect(output).not.toContain('.flat()');
  });
});
