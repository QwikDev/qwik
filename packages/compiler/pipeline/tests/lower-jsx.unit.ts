import { describe, expect, test } from 'vitest';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { analyseModule } from '../analyse/analyse-module';
import { lowerJsx } from '../analyse/lower-jsx';
import { createTestLowerContext } from './fixtures';
import { foldStaticOp } from '../generate/fold-static';
import {
  ArgPass,
  OpKind,
  ProgramBodyKind,
  ProjectionKind,
  QrlBodyKind,
  ResumeKind,
  SeedKind,
  ValueKind,
} from '../schema';

function fold(jsx: string, escapeTextContent = false): string {
  const source = `const a = ${jsx};`;
  const parsed = parseModule('t.tsx', source);
  expect(parsed.errors).toEqual([]);
  const statement = parsed.program.body[0];
  if (statement.type !== 'VariableDeclaration') {
    throw new Error('expected a variable declaration');
  }
  const element = unwrapExpression(statement.declarations[0].init);
  if (element?.type !== 'JSXElement') {
    throw new Error('expected a JSX element');
  }
  const { ctx } = createTestLowerContext(parsed.program, source);
  return foldStaticOp(lowerJsx(element, ctx), escapeTextContent);
}

describe('JSX lowering + static folding', () => {
  test('element with text', () => {
    expect(fold('<p>Hello Qwik</p>')).toBe('<p>Hello Qwik</p>');
  });

  test('nested elements', () => {
    expect(fold('<section><h1>A</h1><p>x</p></section>')).toBe(
      '<section><h1>A</h1><p>x</p></section>'
    );
  });

  test('void tag drops the authored slash and has no closing tag', () => {
    expect(fold('<div>a<br/>b</div>')).toBe('<div>a<br>b</div>');
  });

  test('ssr fold keeps text raw; attribute values always escape', () => {
    expect(fold('<p title="A&B">A&B</p>')).toBe('<p title="A&amp;B">A&B</p>');
  });

  test('csr fold escapes text for template markup', () => {
    expect(fold('<p title="A&B">A&B</p>', true)).toBe('<p title="A&amp;B">A&amp;B</p>');
  });

  test('string, bare-boolean, and JSX-alias attributes', () => {
    expect(fold('<main className="shell" htmlFor="x" hidden></main>')).toBe(
      '<main class="shell" for="x" hidden></main>'
    );
  });

  test('aria attributes stringify boolean-like strings', () => {
    expect(fold('<main aria-hidden="false" draggable="false"></main>')).toBe(
      '<main aria-hidden="false" draggable="false"></main>'
    );
  });

  test('multi-line JSX text normalizes whitespace', () => {
    expect(fold('(<p>\n      one\n      two\n    </p>)')).toBe('<p>one two</p>');
  });

  test('comment children render nothing', () => {
    expect(fold('<p>{/* note */}x</p>')).toBe('<p>x</p>');
  });

  test('rejects dynamic children, dynamic attributes, spreads, unresolved components, void children', () => {
    // A dynamic child now lowers to a hole op; only the static FOLD refuses it.
    expect(() => fold('<p>{value}</p>')).toThrow('folding the op "hole"');
    expect(() => fold('<p title={value}></p>')).toThrow('folding the non-static prop "dynamic"');
    expect(() => fold('<p {...rest}></p>')).toThrow('a JSX spread attribute');
    expect(() => fold('<Foo></Foo>')).toThrow('The component "Foo" is not declared in this scope.');
    expect(() => fold('<br>x</br>')).toThrow('The void element <br> cannot have children.');
  });
});

test('a direct Slot child forwards its named projection without a render QRL', async () => {
  const plan = await analyseModule(
    {
      path: 'src/app.tsx',
      code: `import { Slot } from '@qwik.dev/core';
export const Inner = () => <Slot name="target" />;
export default () => <Inner><Slot name="source" q:slot="target" /></Inner>;
`,
    },
    { transpileTs: true }
  );
  const projection = plan.programs
    .flatMap((program) => (program.body.kind === ProgramBodyKind.Ops ? program.body.ops : []))
    .flatMap((op) => (op.op === OpKind.Component ? op.projections : []))
    .find((projection) => projection.kind === ProjectionKind.Forward);

  expect(projection).toEqual({
    kind: ProjectionKind.Forward,
    name: 'target',
    sourceName: 'source',
    fallback: null,
    id: { kind: SeedKind.Projection, ordinal: 0 },
  });
});

test('a dynamic Slot name lowers inside one render QRL', async () => {
  const plan = await analyseModule(
    {
      path: 'src/app.tsx',
      code: `import { Slot } from '@qwik.dev/core';
export default (props) => <Slot name={props.name} />;
`,
    },
    { transpileTs: true }
  );
  const dynamicSlot = plan.programs
    .flatMap((program) => (program.body.kind === ProgramBodyKind.Ops ? program.body.ops : []))
    .find((op) => op.op === OpKind.DynamicSlot);

  expect(dynamicSlot).toMatchObject({
    op: OpKind.DynamicSlot,
    render: { args: [{ pass: ArgPass.Props }] },
  });
  if (dynamicSlot?.op !== OpKind.DynamicSlot) {
    throw new Error('expected a dynamic slot');
  }
  const render = plan.qrls.find((qrl) => qrl.id === dynamicSlot.render.qrl);
  expect(render?.body.b).toBe(QrlBodyKind.Program);
  if (render?.body.b !== QrlBodyKind.Program) {
    throw new Error('expected a render program');
  }
  const body = plan.programs[render.body.program].body;
  expect(body.kind).toBe(ProgramBodyKind.Ops);
  if (body.kind !== ProgramBodyKind.Ops || body.ops[0]?.op !== OpKind.Slot) {
    throw new Error('expected a slot render operation');
  }
  expect(body.ops[0].nameValue).toMatchObject({
    v: ValueKind.Computed,
    resume: { r: ResumeKind.Inline },
  });
  expect(plan.qrls).toHaveLength(2);
});
