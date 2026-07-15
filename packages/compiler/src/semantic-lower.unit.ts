import { describe, expect, test } from 'vitest';
import { parseModule } from './parse';
import type { CompilerContext } from './types';
import { analyzeModule } from './analysis';
import { discoverComponents } from './discover';
import { extractQrls } from './extract';
import { lowerSemanticComponentPlan } from './semantic-lower';
import type { SemanticLowerResult } from './semantic-lower';
import type { ModuleAnalysis } from './plan-types';
import { validateComponentPlan } from './validate-component-plan';

function lower(code: string): { result: SemanticLowerResult; analysis: ModuleAnalysis } {
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
  const components = discoverComponents(ctx.program!, analysis);
  const component = components.find((candidate) => candidate.exportName === 'App') ?? components[0];
  expect(component).toBeDefined();
  return { result: lowerSemanticComponentPlan(component, extracted), analysis };
}

function success(code: string) {
  const lowered = lower(code);
  expect(lowered.result.kind).toBe('success');
  if (lowered.result.kind !== 'success') {
    throw new Error(lowered.result.message);
  }
  expect(validateComponentPlan(lowered.result.plan, lowered.analysis)).toEqual([]);
  return lowered.result.plan;
}

describe('semantic lowering', () => {
  test('builds a target-neutral tree with explicit effects and lifetimes', () => {
    const plan = success(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <button class="save" title={count.value}>{count.value}</button>;
}`);

    expect(plan.render.roots[0]).toMatchObject({
      kind: 'element',
      tag: 'button',
      props: [
        { kind: 'static', name: 'class', value: 'save' },
        { kind: 'dynamic', name: 'title', value: { kind: 'source' } },
      ],
      children: [{ kind: 'dynamic-value', output: 'text', value: { kind: 'source' } }],
    });
    expect(plan.render.effects.map((effect) => effect.kind)).toEqual(['attribute', 'text']);
    expect(JSON.stringify(plan.render)).not.toMatch(/"html"|"path"|create[A-Z]/);
    expect(plan.lifetimes[0]).toMatchObject({ owner: 'component', parentId: null });
  });

  test('inlines a single-use static JSX setup binding', () => {
    const plan = success(`export function App() {
  const someJsx = <div>Some JSX</div>;
  return <button>{someJsx}</button>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element') {
      throw new Error('Expected element output');
    }
    expect(root.children).toMatchObject([{ kind: 'element', tag: 'div' }]);
    expect(plan.setup).not.toContainEqual(expect.objectContaining({ kind: 'render-value' }));
  });

  test('marks only a direct useId binding read as a compiler string', () => {
    const plan = success(`import { useId } from '@qwik.dev/core';
export function App() {
  const id = useId();
  return <label for={id} hidden={id.length > 0}>Name</label>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element') {
      throw new Error('Expected element output');
    }
    expect(root.props).toMatchObject([
      { kind: 'dynamic', value: { kind: 'expression', compilerString: true } },
      { kind: 'dynamic', value: { kind: 'expression', compilerString: false } },
    ]);
  });

  test('does not mark a mutable useId binding as a compiler string', () => {
    const plan = success(`import { useId } from '@qwik.dev/core';
export function App() {
  let id = useId();
  id = false;
  return <label hidden={id}>Name</label>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element') {
      throw new Error('Expected element output');
    }
    expect(root.props).toMatchObject([{ kind: 'dynamic', value: { kind: 'segment' } }]);
  });

  test('gives repeated JSX setup values independent dynamic content boundaries', () => {
    const plan = success(`export function App() {
  const item = <span>Item</span>;
  return <div>{item}{item}</div>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element') {
      throw new Error('Expected an element root');
    }
    expect(root.children).toMatchObject([
      { kind: 'dynamic-value', output: 'content' },
      { kind: 'dynamic-value', output: 'content' },
    ]);
    expect(root.children[0]).not.toBe(root.children[1]);
    const lifetimeIds = root.children.flatMap((child) =>
      child.kind === 'dynamic-value' ? [child.lifetimeId] : []
    );
    expect(new Set(lifetimeIds).size).toBe(2);
  });

  test('keeps a JSX factory referenced from a lazy render function', () => {
    const plan = success(`export function App(props) {
  const item = <span>Item</span>;
  return <div>{props.show && item}</div>;
}`);

    expect(plan.setup).toContainEqual(expect.objectContaining({ kind: 'render-value' }));
  });

  test.each([
    ['mutable', 'let item = <span />;'],
    ['destructured', 'const { item } = { item: <span /> };'],
    ['mixed', 'const item = <span />, other = 1;'],
  ])('rejects a %s local JSX declaration', (_name, declaration) => {
    const lowered = lower(`export function App() {
  ${declaration}
  return <div>{item}</div>;
}`);
    expect(lowered.result).toMatchObject({
      kind: 'failure',
      code: 'unsupported-syntax',
      message: 'Local JSX setup values require one const identifier with a direct JSX initializer.',
    });
  });

  test('expands static object spreads before semantic last-write-wins', () => {
    const plan = success(`export function App() {
  return <button title="before" {...{ title: 'spread', hidden: true }} title="after" hidden={false}>Save</button>;
}`);
    expect(plan.render.roots[0]).toMatchObject({
      kind: 'element',
      propsEffect: null,
      props: [
        { kind: 'static', name: 'title', value: 'after' },
        { kind: 'static', name: 'hidden', value: false },
      ],
    });
    expect(plan.segments.some((segment) => segment.ctxName === 'props')).toBe(false);
  });

  test('keeps a dynamic attribute independent from a static object spread', () => {
    const plan = success(`export function App({ label }) {
  return <button {...{ hidden: true }} title={label}>Save</button>;
}`);
    expect(plan.render.roots[0]).toMatchObject({
      kind: 'element',
      propsEffect: null,
      props: [
        { kind: 'static', name: 'hidden', value: true },
        { kind: 'dynamic', name: 'title', value: { kind: 'segment' } },
      ],
    });
  });

  test('lowers direct and statically expanded native binds without expression segments', () => {
    const plan = success(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const first = useSignal('first');
  const second = useSignal('second');
  return <input bind:value={first} {...{ 'bind:checked': second }} />;
}`);
    expect(plan.render.roots[0]).toMatchObject({
      kind: 'element',
      propsEffect: null,
      props: [
        { kind: 'bind', name: 'value', value: { kind: 'source' } },
        { kind: 'bind', name: 'checked', value: { kind: 'source' } },
      ],
    });
    expect(plan.render.effects.map((effect) => effect.kind)).toEqual(['attribute', 'attribute']);
    expect(plan.segments.some((segment) => segment.ctxName === 'props')).toBe(false);
  });

  test('keeps an ordered bind handler when a later value prop wins', () => {
    const plan = success(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const value = useSignal('first');
  return <input bind:value={value} value="override" />;
}`);
    expect(plan.render.roots[0]).toMatchObject({
      kind: 'element',
      props: [
        { kind: 'bind', name: 'value', effectId: null },
        { kind: 'static', name: 'value', value: 'override' },
      ],
    });
    expect(plan.render.effects).toEqual([]);
  });

  test('classifies native refs without effects or segments', () => {
    const plan = success(`import { useSignal } from '@qwik.dev/core';
export function App({ forwarded }) {
  const element = useSignal();
  const named = (value) => console.log(value);
  return <><div ref={element} /><div ref={(value) => console.log(value)} /><div ref={named} /><div ref={forwarded} /></>;
}`);

    expect(
      plan.render.roots.map((root) => (root.kind === 'element' ? root.props[0] : null))
    ).toMatchObject([
      { kind: 'ref', mode: 'signal' },
      { kind: 'ref', mode: 'function' },
      { kind: 'ref', mode: 'function' },
      { kind: 'ref', mode: 'unknown' },
    ]);
    expect(plan.render.effects).toEqual([]);
    expect(plan.segments).toEqual([]);
  });

  test('applies native ref last-write-wins and keeps component refs as props', () => {
    const plan = success(`import { useSignal } from '@qwik.dev/core';
function Child(props) { return <div>{props.ref.value}</div>; }
export function App() {
  const first = useSignal();
  const second = useSignal();
  return <><div ref={first} {...{ ref: second }} /><Child ref={first} /></>;
}`);

    expect(plan.render.roots[0]).toMatchObject({
      kind: 'element',
      props: [{ kind: 'ref', mode: 'signal', value: { kind: 'expression' } }],
    });
    expect(plan.render.roots[1]).toMatchObject({
      kind: 'component',
      props: [{ kind: 'dynamic', name: 'ref' }],
    });
  });

  test.each(['null', 'undefined'])(
    'lets a final %s ref suppress an earlier native ref without runtime work',
    (emptyRef) => {
      const plan = success(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const element = useSignal();
  return <div ref={element} ref={${emptyRef}} />;
}`);

      expect(plan.render.roots[0]).toMatchObject({ kind: 'element', props: [] });
    }
  );

  test('keeps nested QRL boundaries inside a direct ref expression', () => {
    const plan = success(`import { $ } from '@qwik.dev/core';
export function App() {
  const refs = [];
  return <div ref={(element) => refs.push($(() => element))} />;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element' || root.props[0]?.kind !== 'ref') {
      throw new Error('Expected a native ref');
    }

    expect(root.props[0].value).toMatchObject({
      kind: 'expression',
      boundaries: [{ segmentId: expect.any(String) }],
    });
    expect(plan.segments).toHaveLength(1);
    expect(plan.render.effects).toEqual([]);
  });

  test('keeps a potentially observable ref property read inside the opaque props path', () => {
    const plan = success(`export function App(props) {
  return <div {...{ ref: props.ref }} />;
}`);

    expect(plan.render.roots[0]).toMatchObject({
      kind: 'element',
      propsEffect: null,
      props: [{ kind: 'spread', value: { kind: 'segment' } }],
    });
  });

  test('treats an unknown function-call result as dynamic content', () => {
    const plan = success(`import { renderItem } from './render-item';
export function App({ value }) {
  return <section><b>Before</b>{renderItem(value)}<i>After</i></section>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element') {
      throw new Error('Expected an element root');
    }
    expect(root.children[1]).toMatchObject({ kind: 'dynamic-value', output: 'content' });
  });

  test.each([
    ['member prop', 'props', 'props.label'],
    ['destructured prop', '{ label }', 'label'],
  ])('classifies an unknown %s as escaped dynamic text', (_name, parameter, expression) => {
    const plan = success(`export function App(${parameter}) {
  return <p>{${expression}}</p>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element') {
      throw new Error('Expected an element root');
    }
    expect(root.children[0]).toMatchObject({ kind: 'dynamic-value', output: 'text' });
    expect(plan.render.effects).toContainEqual(expect.objectContaining({ kind: 'text' }));
  });

  test('keeps static source concatenation in the render template', () => {
    const plan = success(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const value = useSignal({ label: 'ready' });
  return <p>{value.value && 'Value: ' + value.value}</p>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element' || root.children[0].kind !== 'branch') {
      throw new Error('Expected a branch');
    }
    expect(root.children[0].then.render.roots).toMatchObject([
      { kind: 'static-text', value: 'Value: ' },
      { kind: 'dynamic-value', output: 'text', value: { kind: 'source' } },
    ]);
    expect(plan.segments.some((segment) => segment.ctxName === 'text')).toBe(false);
  });

  test('lowers a keyed value map to the common collection plan', () => {
    const plan = success(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a', label: 'A' }]);
  return <ul>{items.value.map((item, index) => <li key={item.id}>{item.label}{index}</li>)}</ul>;
}`);

    const root = plan.render.roots[0];
    expect(root.kind).toBe('element');
    if (root.kind !== 'element') {
      return;
    }
    expect(root.children[0]).toMatchObject({
      kind: 'collection',
      usesIndexSignal: true,
      row: { kind: 'collection-row' },
    });
    const loop = root.children[0];
    if (loop.kind !== 'collection') {
      return;
    }
    expect(loop.source.kind).toBe('direct-reactive');
    expect(plan.segments.some((segment) => segment.kind === 'collectionSource')).toBe(false);
    expect(plan.lifetimes.find((lifetime) => lifetime.id === loop.lifetimeId)).toMatchObject({
      owner: 'collection',
      commit: 'atomic-reconcile',
    });
    expect(plan.segments.find((segment) => segment.id === loop.row.segmentId)?.render).toBe(
      loop.row
    );
  });

  test('rejects a reactive collection without a key', () => {
    const lowered = lower(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a' }]);
  return <ul>{items.value.map((item) => <li>{item.id}</li>)}</ul>;
}`);
    expect(lowered.result).toMatchObject({ kind: 'failure', code: 'for-key' });
  });

  test('rejects an async reactive row', () => {
    const lowered = lower(`import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a', label: async () => 'A' }]);
  return <ul>{items.value.map(async (item) => <li key="row">{await item.label()}</li>)}</ul>;
}`);
    expect(lowered.result).toMatchObject({ kind: 'failure', code: 'async-for' });
  });

  test('keeps direct-array async rows sequential', () => {
    const plan = success(`export function App({ items }) {
  return <ul>{items.map(async (item) => <li>{await item.label()}</li>)}</ul>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element' || root.children[0].kind !== 'collection') {
      throw new Error('Expected a semantic collection plan');
    }
    expect(root.children[0].source.kind).toBe('direct-array');
    expect(root.children[0].row.async).toBe(true);
    expect(root.children[0].key).toBeNull();
  });

  test('lowers a plain map to the same collection plan with nested segments', () => {
    const plan = success(`export function App({ items }) {
  return <ul>{items.map((item) => <li key={item.id} onClick$={() => item.select()}>{item.label}</li>)}</ul>;
}`);

    const root = plan.render.roots[0];
    expect(root.kind).toBe('element');
    if (root.kind !== 'element') {
      return;
    }
    const collection = root.children[0];
    expect(collection).toMatchObject({
      kind: 'collection',
      key: null,
      source: { kind: 'direct-array' },
      row: { kind: 'collection-row' },
    });
    if (collection.kind !== 'collection') {
      return;
    }
    expect(plan.segments.find((segment) => segment.id === collection.row.segmentId)).toMatchObject({
      render: collection.row,
    });
    expect(plan.segments.some((segment) => segment.kind === 'forKey')).toBe(false);
    expect(collection.row.render.roots[0]).toMatchObject({
      kind: 'element',
      props: [{ kind: 'event', name: 'onClick$' }],
      children: [{ kind: 'dynamic-value' }],
    });
  });

  test('uses the collection plan for scalar map rows too', () => {
    const plan = success(`export function App({ items }) {
  return <p>{items.map((item) => item.label)}</p>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element' || root.children[0].kind !== 'collection') {
      throw new Error('Expected a semantic collection plan');
    }
    expect(root.children[0]).toMatchObject({
      key: null,
      row: {
        kind: 'collection-row',
        render: { roots: [{ kind: 'dynamic-value' }] },
      },
    });
  });

  test('keeps a direct array index positional without making it reactive', () => {
    const plan = success(`export function App({ items }) {
  return <ul>{items.map((item, index) => <li key={item.id}>{index}</li>)}</ul>;
}`);
    const root = plan.render.roots[0];
    if (root.kind !== 'element' || root.children[0].kind !== 'collection') {
      throw new Error('Expected a semantic collection plan');
    }
    const collection = root.children[0];
    const row = plan.segments.find((segment) => segment.id === collection.row.segmentId)!;

    expect(collection.source.kind).toBe('direct-array');
    expect(collection.key).toBeNull();
    expect(collection.usesIndexSignal).toBe(false);
    expect(row.usedParameterBindingIds).toEqual(row.parameterBindingIds);
    expect(row.captures.some((capture) => capture.access === 'loop-value')).toBe(false);
  });

  test('keeps a derived multi-source receiver in its enclosing render segment', () => {
    const code = `const combine = (...lists) => lists.flat();
export function App({ visible, left, right }) {
  return <>{visible && combine(left.value, right.value).filter((item) => item.enabled).map((item) => <i key={item.id}>{item.id}</i>)}</>;
}`;
    const plan = success(code);
    const branch = plan.render.roots[0];
    if (branch.kind !== 'branch' || branch.then.render.roots[0].kind !== 'collection') {
      throw new Error('Expected a collection inside a branch render segment');
    }
    const collection = branch.then.render.roots[0];
    if (collection.source.kind !== 'derived') {
      throw new Error('Expected a computed collection source');
    }
    expect(code.slice(collection.source.expression[0], collection.source.expression[1])).toBe(
      'combine(left.value, right.value).filter((item) => item.enabled)'
    );
    const enclosingSegment = plan.segments.find((segment) => segment.id === branch.then.segmentId);
    expect(enclosingSegment?.captures.map((capture) => capture.name)).toEqual(['left', 'right']);
    expect(enclosingSegment?.moduleReferences.map((reference) => reference.name)).toContain(
      'combine'
    );
    const sourceSegment = plan.segments.find(
      (segment) => segment.id === collection.source.segment.segmentId
    );
    expect(sourceSegment).toMatchObject({
      parentId: branch.then.segmentId,
      kind: 'collectionSource',
      ctxName: 'collection:source',
      captures: [{ name: 'left' }, { name: 'right' }],
      moduleReferences: [{ name: 'combine' }],
    });
    expect(collection.source.segment.componentPropBindingIds).toEqual(
      sourceSegment?.captures.map((capture) => capture.bindingId)
    );
  });

  test('keeps component props in source order for target planners', () => {
    const plan = success(`function Child() { return <div />; }
export function App({ first, rest }) {
  return <Child value="before" {...rest} value={first} />;
}`);
    expect(plan.render.roots[0]).toMatchObject({
      kind: 'component',
      props: [
        { kind: 'static', name: 'value', value: 'before' },
        { kind: 'spread', value: { kind: 'expression' } },
        { kind: 'dynamic', name: 'value' },
      ],
    });
    expect(plan.render.effects.map((effect) => effect.kind)).toEqual(['props', 'props']);
  });

  test('models overlapping DOM props as one source-ordered effect', () => {
    const plan = success(`export function App({ attrs, label }) {
  return <div {...attrs} title={\`label \${label}\`} />;
}`);
    const root = plan.render.roots[0];
    expect(root).toMatchObject({
      kind: 'element',
      propsEffect: { segment: { segmentId: expect.any(String) } },
      props: [{ kind: 'spread' }, { kind: 'dynamic', name: 'title' }],
    });
    expect(plan.render.effects).toHaveLength(1);
    expect(plan.render.effects[0]).toMatchObject({ kind: 'props', value: { kind: 'segment' } });
    if (root.kind !== 'element' || root.propsEffect === null) {
      return;
    }
    expect(
      root.props.filter((prop) => prop.kind !== 'static').map((prop) => prop.effectId)
    ).toEqual([root.propsEffect.effectId, root.propsEffect.effectId]);
  });

  test('models branches and slots as owned render functions', () => {
    const plan = success(`import { Slot } from '@qwik.dev/core';
export function App({ ready }) {
  return <section>{ready ? <strong>ready</strong> : <em>waiting</em>}<Slot name="aside">fallback</Slot></section>;
}`);
    const root = plan.render.roots[0];
    expect(root.kind).toBe('element');
    if (root.kind !== 'element') {
      return;
    }
    expect(root.children).toMatchObject([
      { kind: 'branch', then: { kind: 'branch' }, else: { kind: 'branch' } },
      { kind: 'slot', name: 'aside', fallback: { kind: 'slot' } },
    ]);
  });

  test('reports lifecycle registration owned by a collection render function', () => {
    const lowered = lower(`import { useTask$ } from '@qwik.dev/core';
export function App({ items }) {
  return <ul>{items.map((item) => {
    useTask$(() => item.prepare());
    return <li>{item.label}</li>;
  })}</ul>;
}`);
    expect(lowered.result.kind).toBe('success');
    if (lowered.result.kind !== 'success') {
      return;
    }
    expect(validateComponentPlan(lowered.result.plan, lowered.analysis)).toContainEqual(
      expect.objectContaining({ message: 'render functions cannot register lifecycle hooks' })
    );
  });
});
