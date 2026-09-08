import { expect, test } from 'vitest';
import { parseModule } from '../analyse/ast/parse';
import { createJsxAnalysis, JsxValueKind } from '../analyse/ast/jsx-analysis';
import { deepFreeze } from './fixtures';
import { createBindingGraph } from '../analyse/ast/bindings';

function expression(source: string) {
  const parsed = parseModule('test.tsx', `const value = ${source};`);
  expect(parsed.errors).toEqual([]);
  const statement = parsed.program.body[0];
  if (statement.type !== 'VariableDeclaration' || statement.declarations[0].init === null) {
    throw new Error('expected an initializer');
  }
  return statement.declarations[0].init;
}

test('shares branch analysis and retains original nodes through parentheses', () => {
  const node = expression('outer ? (<A />) : inner ? <B /> : null');
  const jsx = createJsxAnalysis();
  const value = jsx.read(node);
  expect(jsx.read(node)).toBe(value);
  expect(value.kind).toBe(JsxValueKind.Conditional);
  if (value.kind !== JsxValueKind.Conditional || node.type !== 'ConditionalExpression') {
    throw new Error('expected a conditional');
  }
  expect(value.node).toBe(node);
  expect(value.then).toBe(jsx.read(node.consequent));
  expect(value.else).toBe(jsx.read(node.alternate));
  expect(value.then.kind).toBe(JsxValueKind.Element);
  expect(value.else.kind).toBe(JsxValueKind.Conditional);
  expect(value.hasJsxValue).toBe(true);
});

test('fragments expose children but elements remain boundaries', () => {
  const node = expression('<><A><Nested key="nested" /></A>{ok && <B />}text</>');
  const value = createJsxAnalysis().read(node);
  if (value.kind !== JsxValueKind.Fragment || node.type !== 'JSXFragment') {
    throw new Error('expected a fragment');
  }
  expect(value.children.map((child) => child.kind)).toEqual([
    JsxValueKind.Element,
    JsxValueKind.Logical,
    JsxValueKind.Text,
  ]);
  expect(value.children[0].node).toBe(node.children[0]);
});

test('collection analysis retains callback setup and shares its row', () => {
  const node = expression('items.map((item) => { const id = item.id; return <li key={id} />; })');
  const jsx = createJsxAnalysis();
  const value = jsx.read(node);
  if (value.kind !== JsxValueKind.Collection) {
    throw new Error('expected a collection');
  }
  expect(value.body!.statements).toHaveLength(1);
  expect(value.row).toBe(jsx.read(value.body!.expression));
  expect(value.row!.kind).toBe(JsxValueKind.Element);
  expect(value.hasJsxValue).toBe(false);
});

test.each([
  ['render(<A />)', true],
  ['wrap(render(<A />))', true],
  ['render(...[<A />])', true],
  ['render?.(<A />)', true],
  ['render(1)', false],
  ['() => <A />', false],
  ['(<A />, 1)', false],
  ['(1, <A />)', true],
  ['[null, <A />]', true],
  ['({ body: [<A />] }).body', true],
  ['({ body: <A /> })?.body', true],
  ['ok || <A />', true],
  ['ok ? 1 : 2', false],
])('identifies JSX only in value positions: %s', (source, expected) => {
  expect(createJsxAnalysis().read(expression(source)).hasJsxValue).toBe(expected);
});

test('extracts outer JSX roots from nested containers in evaluation order', () => {
  const node = expression('{ [key]: <A><Nested /></A>, body: [null, ...[<B />], ok && <C />] }');
  const roots = createJsxAnalysis().expressionRoots(node);
  expect(
    roots.map((root) =>
      root.type === 'JSXElement'
        ? root.openingElement.name.type === 'JSXIdentifier' && root.openingElement.name.name
        : null
    )
  ).toEqual(['A', 'B', 'C']);
});

test('retains callback scopes alongside JSX call arguments', () => {
  const jsx = createJsxAnalysis();
  expect(jsx.expressionRoots(expression('wrap(<A />, ...[render(<B />)])'))).toHaveLength(2);
  const roots = jsx.expressionRoots(expression('wrap(() => <A />)'));
  expect(roots.map((root) => root.type)).toEqual(['ArrowFunctionExpression']);
  expect(jsx.factory(roots[0])?.roots.map((root) => root.type)).toEqual(['JSXElement']);
});

test('shares factory roots without classifying the function as a JSX value', () => {
  const node = expression(
    '(value) => { const content = <A>{value}</A>; return ok ? content : <B />; }'
  );
  const jsx = createJsxAnalysis();
  const factory = jsx.factory(node);
  expect(factory?.fn).toBe(node);
  expect(factory?.roots).toHaveLength(2);
  expect(jsx.factory(node)).toBe(factory);
  expect(jsx.read(node).hasJsxValue).toBe(false);
  expect(jsx.expressionRoots(node)).toEqual([node]);
  expect(jsx.factory(expression('(value) => value'))).toBeNull();
});

test('analysis is local to a module and does not mutate frozen AST nodes', () => {
  const node = expression('ok ? <A /> : <B />');
  const before = JSON.stringify(node);
  deepFreeze(node);
  expect(createJsxAnalysis().read(node)).not.toBe(createJsxAnalysis().read(node));
  expect(JSON.stringify(node)).toBe(before);
});

test('follows initializer aliases by binding without crossing shadowed names', () => {
  const { program } = parseModule(
    'test.tsx',
    `
    const content = <p />;
    const alias = content;
    { const content = 'text'; const alias = content; }
  `
  );
  const jsx = createJsxAnalysis(createBindingGraph(program));
  const outer = program.body[1];
  const block = program.body[2];
  if (outer.type !== 'VariableDeclaration' || block.type !== 'BlockStatement') {
    throw new Error('expected declarations');
  }
  const inner = block.body[1];
  if (inner.type !== 'VariableDeclaration') {
    throw new Error('expected a shadowed declaration');
  }
  expect(jsx.read(outer.declarations[0].init!).hasJsxValue).toBe(true);
  expect(jsx.read(inner.declarations[0].init!).hasJsxValue).toBe(false);
});

test('terminates analysis of cyclic initializer references', () => {
  const { program } = parseModule('test.tsx', 'var first = second; var second = first;');
  const jsx = createJsxAnalysis(createBindingGraph(program));
  for (const statement of program.body) {
    if (statement.type !== 'VariableDeclaration') {
      throw new Error('expected a declaration');
    }
    expect(jsx.read(statement.declarations[0].init!).hasJsxValue).toBe(false);
  }
});
