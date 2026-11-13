import { describe, expect, test } from 'vitest';
import type { Node } from 'oxc-parser';
import { createBindingGraph } from '../analyse/ast/bindings';
import { parseModule } from '../analyse/ast/parse';
import { createLowerContext } from '../analyse/lower-context';
import { scanModuleSurface } from '../analyse/module-surface';
import { emptyPlan } from '../analyse/plan';

const IMPORTS = `import { component$, $, useSignal, useTask$ } from '@qwik.dev/core';\nimport { Child } from './child';\n`;

/** `body` inside a component that owns the signals `s` and `show`. */
const inApp = (body: string) =>
  `${IMPORTS}export const App = component$(() => {\n  const s = useSignal(0);\n  const show = useSignal(true);\n  ${body}\n});`;

function analyseLifts(code: string, path = 'src/app.tsx') {
  const { program } = parseModule(path, code);
  const bindings = createBindingGraph(program);
  const plan = emptyPlan(path, code);
  plan.bindings = bindings.bindings;
  const coreBindings = scanModuleSurface(program, null, plan, bindings);
  const { lifts } = createLowerContext(plan, path, {}, bindings, coreBindings, undefined, program);
  const bindingNamed = (name: string) =>
    bindings.bindings.findIndex((entry) => entry.name === name);
  return {
    lifts,
    bindings,
    /** Names of the lifted locals, `+` marking one its own scope also declares. */
    lifted: () =>
      bindings.bindings.flatMap(({ name }, binding) =>
        lifts.isLifted(binding) ? [`${name}${lifts.isDeclared(binding) ? '+' : ''}`] : []
      ),
    isComponent: (name: string) => lifts.liftables.get(bindingNamed(name))?.component != null,
    references: (name: string) =>
      bindings.referencesOf(bindingNamed(name)).map(({ node }) => node as Node),
  };
}

describe('lift analysis', () => {
  test('a local passed as a qrl lifts without being declared', () => {
    expect(
      analyseLifts(
        inApp(`const f = () => s.value; const q = $(f); useTask$(() => { q(); });`)
      ).lifted()
    ).toEqual(['f']);
    expect(
      analyseLifts(inApp(`const f = () => s.value; return <Child then$={f} />;`)).lifted()
    ).toEqual(['f']);
  });

  test.each([
    ['a never-written let lifts', inApp(`let f = () => s.value; useTask$(() => { f(); });`), ['f']],
    ['a never-written var lifts', inApp(`var f = () => s.value; useTask$(() => { f(); });`), ['f']],
    [
      'a written let stays',
      inApp(`let f = () => s.value; f = () => 1; useTask$(() => { f(); });`),
      [],
    ],
    [
      'a local of a plain function lifts',
      `${IMPORTS}export function show() { const X = () => 1; return $(() => X()); }`,
      ['X'],
    ],
    [
      'a local of a task callback lifts',
      inApp(`useTask$(() => { const f = () => s.value; const q = $(() => f()); q(); });`),
      ['f'],
    ],
  ])('%s when a boundary reads it', (_, code, lifted) => {
    expect(analyseLifts(code).lifted()).toEqual(lifted);
  });

  test('a qrl-of reference is never a boundary read', () => {
    const { lifts, references } = analyseLifts(
      inApp(`const f = () => s.value; return <Child then$={f} />;`)
    );
    const [reference] = references('f');
    expect(lifts.isOwnRead(reference, reference)).toBe(false);
  });

  test.each([
    ['a JSX container', `return <div>{<V />}</div>;`],
    ['a literal array of tags', `return <div>{[<V key="a" />, <V key="b" />]}</div>;`],
    ['a literal-array row', `return <ul>{[1, 2].map((n) => <V key={n} />)}</ul>;`],
  ])('a local component rendered in %s stays inline', (_, body) => {
    expect(
      analyseLifts(inApp(`const V = component$(() => <b>{s.value}</b>);\n  ${body}`)).lifted()
    ).toEqual([]);
  });

  test('a local component in a branch arm lifts', () => {
    expect(
      analyseLifts(
        inApp(
          `const V = component$(() => <b>{s.value}</b>);\n  return <div>{show.value && <V />}</div>;`
        )
      ).lifted()
    ).toEqual(['V']);
  });

  test('a named component$ in a lifted local function lifts and stays declared there', () => {
    const body = `const make = () => { const B = component$(() => <b>{s.value}</b>); return B; };`;
    expect(
      analyseLifts(inApp(`${body}\n  return <button onClick$={() => make()} />;`)).lifted()
    ).toEqual(['make', 'B+']);
    expect(analyseLifts(inApp(`${body}\n  const V = make();\n  return <V />;`)).lifted()).toEqual(
      []
    );
  });

  test.each([
    ['written as a plain arrow', 'const B = () => <b>{s.value}</b>;'],
    ['written as a function declaration', 'function B() { return <b>{s.value}</b>; }'],
  ])(
    'a component %s in a helper lifts with the helper and stays declared there',
    (_, declaration) => {
      const body = `const make = () => { ${declaration} return B; };`;
      const lifting = analyseLifts(inApp(`${body}\n  return <button onClick$={() => make()} />;`));
      expect(lifting.lifted()).toEqual(['make', 'B+']);
      expect(lifting.isComponent('B')).toBe(true);
      const inPlace = analyseLifts(inApp(`${body}\n  const V = make();\n  return <V />;`));
      expect(inPlace.lifted()).toEqual([]);
      expect(inPlace.isComponent('B')).toBe(true);
    }
  );

  test.each([
    [
      'an uppercase function returning no JSX in a helper',
      'const make = () => { const B = () => s.value; return B; };',
      'B',
    ],
    [
      'a lowercase function returning JSX in a helper',
      'const make = () => { const b = () => <b/>; return b; };',
      'b',
    ],
    [
      'a plain function component in a $() body',
      'const q = $(() => { const B = () => <b/>; return B; });',
      'B',
    ],
    [
      'a plain function component in an event handler',
      'return <button onClick$={() => { const B = () => <b/>; return B; }} />;',
      'B',
    ],
  ])('%s is a plain function', (_, body, name) => {
    expect(analyseLifts(inApp(body)).isComponent(name)).toBe(false);
  });

  const row = 'const Row = (item) => <li>{item}{s.value}</li>;';
  test.each([
    ['the setup calls in a hole', false, `${row}\n  return <ul>{Row(1)}</ul>;`],
    [
      'a helper calls',
      false,
      `const make = () => { ${row} return Row(1); };\n  return <ul>{make()}</ul>;`,
    ],
    [
      'a .map callback calls',
      false,
      `const items = useSignal([1]);\n  ${row}\n  return <ul>{items.value.map((i) => Row(i))}</ul>;`,
    ],
    [
      'only an event handler calls',
      false,
      `${row}\n  return <button onClick$={() => console.log(Row(1))} />;`,
    ],
    ['the setup calls optionally', false, `${row}\n  return <ul>{Row?.(1)}</ul>;`],
    ['the setup calls through a cast', false, `${row}\n  return <ul>{(Row as any)(1)}</ul>;`],
    [
      'written as a function declaration the setup calls',
      false,
      'function Row(item) { return <li>{item}</li>; }\n  return <ul>{Row(1)}</ul>;',
    ],
    ['the setup only renders as a tag', true, `${row}\n  return <ul><Row /></ul>;`],
    [
      'the setup only passes to a function',
      true,
      `const wrap = (X) => X;\n  ${row}\n  const V = wrap(Row);\n  return <ul><V /></ul>;`,
    ],
    [
      'a .map gets as its callback',
      true,
      `const items = useSignal([1]);\n  ${row}\n  return <ul>{items.value.map(Row)}</ul>;`,
    ],
  ])('an uppercase JSX function %s is a component: %s', (_, isComponent, body) => {
    expect(analyseLifts(inApp(body)).isComponent('Row')).toBe(isComponent);
  });

  test('an uppercase JSX function the code both calls and renders as a tag is refused', () => {
    expect(() => analyseLifts(inApp(`${row}\n  return <ul>{Row(1)}<Row /></ul>;`))).toThrow(
      'pipeline does not support: "Row" called as a function and also rendered as <Row />'
    );
  });

  test('a hole inside a literal-array row is still a boundary', () => {
    expect(
      analyseLifts(
        inApp(`const f = (n) => n + 1;\n  return <ul>{[1, 2].map((n) => <li>{f(n)}</li>)}</ul>;`)
      ).lifted()
    ).toEqual(['f']);
  });

  const chain = {
    arrows: ['const A = () => B() + 1;', 'const B = () => C() + 1;', 'const C = () => s.value;'],
    declarations: [
      'function A() { return B() + 1; }',
      'function B() { return C() + 1; }',
      'function C() { return s.value; }',
    ],
  };
  const orders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  test.each(
    Object.entries(chain).flatMap(([kind, statements]) =>
      orders.map((order) => [
        kind,
        order.map((index) => 'ABC'[index]).join(''),
        order.map((index) => statements[index]),
      ])
    )
  )('a chain of %s lifts whole in the order %s', (_, __, statements) => {
    const { lifted } = analyseLifts(
      inApp(
        `${(statements as string[]).join('\n  ')}\n  return <button onClick$={() => A()}>x</button>;`
      )
    );
    expect(lifted().sort()).toEqual(['A', 'B', 'C']);
  });

  test('a mutually recursive pair read from a boundary lifts both', () => {
    const { lifted } = analyseLifts(
      inApp(`function a(n) { return n ? b(n - 1) : s.value; }
  function b(n) { return n ? a(n - 1) : 1; }
  return <button onClick$={() => a(3)}>x</button>;`)
    );
    expect(lifted()).toEqual(['a', 'b']);
  });

  test('a lifted local its own scope also reads is declared there', () => {
    const { lifted } = analyseLifts(
      inApp(`function a(n) { return n ? b(n - 1) : s.value; }
  function b(n) { return n ? a(n - 1) : 1; }
  const v = a(2);
  return <button onClick$={() => b(3)}>{v}</button>;`)
    );
    expect(lifted()).toEqual(['a+', 'b']);
  });

  test.each([
    [
      'lifts its target, neither declared, when a boundary reads it',
      `const f = () => s.value;\n  const g = f;\n  return <button onClick$={() => g()} />;`,
      ['f', 'g'],
    ],
    [
      'its scope also reads is declared, and so is its target',
      `const f = () => s.value;\n  const g = f;\n  const v = g();\n  return <p>{show.value ? g() : v}</p>;`,
      ['f+', 'g+'],
    ],
    [
      'nothing reads loses its declaration next to a boundary reading its target',
      `const f = () => s.value;\n  const g = f;\n  return <button onClick$={() => f()} />;`,
      ['f', 'g'],
    ],
    [
      'of an alias names the same target',
      `const f = () => s.value;\n  const g = f;\n  const h = g;\n  return <button onClick$={() => h()} />;`,
      ['f', 'g', 'h'],
    ],
    [
      'in a nested function is a plain local of it',
      `const f = () => s.value;\n  return <button onClick$={() => { const g = f; return g(); }} />;`,
      ['f'],
    ],
  ])('an alias of a local function %s', (_, body, lifted) => {
    expect(analyseLifts(inApp(body)).lifted()).toEqual(lifted);
  });

  test('only the innermost boundary reads a lifted local as its own', () => {
    const { lifts, bindings, references } = analyseLifts(
      inApp(`const f = () => s.value;\n  return <div>{show.value && <p>{f()}</p>}</div>;`)
    );
    const [reference] = references('f');
    const hole = bindings.parentOf(reference)!;
    let arm = hole;
    while (arm.type !== 'JSXElement') {
      arm = bindings.parentOf(arm)!;
    }
    expect(lifts.isOwnRead(reference, hole)).toBe(true);
    expect(lifts.isOwnRead(reference, arm)).toBe(false);
  });
});
