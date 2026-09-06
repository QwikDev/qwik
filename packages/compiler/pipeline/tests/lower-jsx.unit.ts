import { describe, expect, test } from 'vitest';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { analyseModule } from '../analyse/analyse-module';
import { lowerJsx } from '../analyse/lower-jsx';
import { createTestLowerContext } from './fixtures';
import { foldStaticOp } from '../generate/fold-static';
import {
  ArgPass,
  EachSourceKind,
  OpKind,
  ProgramBodyKind,
  ProjectionKind,
  QrlBodyKind,
  ResumeKind,
  RowKind,
  SeedKind,
  ValueKind,
  type ModulePlan,
  type Op,
  type QrlUse,
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

  test('fragments preserve child order and introduce no markup', () => {
    expect(fold('<p>before<><i>one</i>{(<><b>two</b></>)}</>after</p>')).toBe(
      '<p>before<i>one</i><b>two</b>after</p>'
    );
  });

  test('adjacent text across fragments lowers to one text node', async () => {
    const plan = await analyseModule(
      {
        path: 'src/app.tsx',
        code: 'export default (props) => <p>one<>two</>{props.value}<i /><b /><em /></p>;',
      },
      {}
    );
    expect(plan.programs[0].body).toMatchObject({
      kind: ProgramBodyKind.Ops,
      ops: [
        {
          op: OpKind.Element,
          children: [
            { op: OpKind.Static, html: 'onetwo' },
            { op: OpKind.Hole },
            { op: OpKind.Element, tag: 'i' },
            { op: OpKind.Element, tag: 'b' },
            { op: OpKind.Element, tag: 'em' },
          ],
        },
      ],
    });
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

test('fragment projections preserve slot names without crossing element boundaries', async () => {
  const plan = await analyseModule(
    {
      path: 'src/app.tsx',
      code: `import { Slot } from '@qwik.dev/core';
export const Card = () => <Slot />;
export default () => <Card><><h1 q:slot="header">Title</h1><section><p q:slot="nested">Body</p></section></><p>After</p></Card>;
`,
    },
    { transpileTs: true }
  );

  expect(componentProjectionNames(plan)).toEqual(['header', '', '']);
  expect(plan.qrls).toHaveLength(5);
});

test('empty fragments create neither projections nor fallback QRLs', async () => {
  const plan = await analyseModule(
    {
      path: 'src/app.tsx',
      code: `import { Slot } from '@qwik.dev/core';
export const Card = () => <Slot><>{/* empty */}{(<></>)}</></Slot>;
export default () => <Card><><></>{/* empty */}</></Card>;
`,
    },
    { transpileTs: true }
  );
  const slots = plan.programs
    .flatMap((program) => (program.body.kind === ProgramBodyKind.Ops ? program.body.ops : []))
    .filter((op) => op.op === OpKind.Slot);

  expect(componentProjectionNames(plan)).toEqual([]);
  expect(slots).toHaveLength(1);
  expect(slots[0].fallback).toBeNull();
  expect(plan.qrls).toHaveLength(2);
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

test('a conditional child projects into its statically named slot', async () => {
  const plan = await analyseModule(
    {
      path: 'src/app.tsx',
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <Slot name="start" />;
export default () => {
  const show = useSignal(true);
  return <Panel>{show.value && <span q:slot="start">start</span>}</Panel>;
};
`,
    },
    { transpileTs: true }
  );

  expect(componentProjectionNames(plan)).toEqual(['start']);
});

describe.each([
  ['items.value', EachSourceKind.Reactive, RowKind.Chunk],
  ["[{ id: 1, title: 'Title' }]", EachSourceKind.Array, RowKind.Inline],
] as const)('collection projections from %s', (source, sourceKind, rowKind) => {
  test.each([
    ['q:slot="header"', '{item.title}', 'header'],
    ['', '<span q:slot="nested">{item.title}</span>', ''],
  ])('uses only the row root slot: %s', async (attribute, children, name) => {
    const plan = await analyseModule(
      {
        path: 'src/app.tsx',
        code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot /></main>;
export default () => {
  const items = useSignal([{ id: 1, title: 'Title' }]);
  return <Panel>{${source}.map((item) => <h2 key={item.id} ${attribute}>${children}</h2>)}</Panel>;
};
`,
      },
      { transpileTs: true }
    );
    expect(componentProjectionNames(plan)).toEqual([name]);
    const [projection] = componentProjections(plan);
    if (projection.kind !== ProjectionKind.Render) {
      throw new Error('expected a rendered projection');
    }
    const qrl = plan.qrls.find((qrl) => qrl.id === projection.use.qrl);
    if (qrl?.body.b !== QrlBodyKind.Program) {
      throw new Error('expected a projection program');
    }
    expect(plan.programs[qrl.body.program].body).toMatchObject({
      kind: ProgramBodyKind.Ops,
      ops: [{ op: OpKind.Each, source: { s: sourceKind }, row: { r: rowKind } }],
    });
    expect(qrl.captures.map((capture) => plan.bindings[capture.binding].name)).toEqual(
      sourceKind === EachSourceKind.Reactive ? ['items'] : []
    );
  });
});

test('a conditional child splits across its statically named slots', async () => {
  const plan = await analyseModule(
    {
      path: 'src/app.tsx',
      code: `import { Slot, useSignal } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="x" /><Slot name="y" /></main>;
export default () => {
  const flip = useSignal(false);
  return <Panel>{flip.value ? <a q:slot="x">alpha</a> : <b q:slot="y">bravo</b>}</Panel>;
};
`,
    },
    { transpileTs: true }
  );

  expect(componentProjectionNames(plan)).toEqual(['x', 'y']);
});

test.each([
  [
    'props.show && <><h1 q:slot="header">Title</h1>{props.details && <p>Details</p>}</>',
    ['header', ''],
    [['h1'], ['p']],
  ],
  [
    'props.show ? (props.details ? <h1 q:slot="header">Title</h1> : <h2 q:slot="header">Short</h2>) : <p>Empty</p>',
    ['header', ''],
    [['h1', 'h2'], ['p']],
  ],
  [
    'props.show ? <><h1 q:slot="header">Title</h1><section><b q:slot="nested">Body</b></section></> : <><h2 q:slot="header">Short</h2><p>Empty</p></>',
    ['header', ''],
    [
      ['h1', 'h2'],
      ['section', 'b', 'p'],
    ],
  ],
  ['props.show && <>{/* empty */}<></></>', [], []],
])(
  'conditional projections select only their own children: %s',
  async (expression, names, tags) => {
    const plan = await analyseModule(
      {
        path: 'src/app.tsx',
        code: `import { Slot } from '@qwik.dev/core';
export const Panel = () => <main><Slot name="header" /><Slot /></main>;
export default (props) => <Panel>{${expression}}</Panel>;
`,
      },
      { transpileTs: true }
    );
    expect(componentProjectionNames(plan)).toEqual(names);
    expect(
      componentProjections(plan).map((projection) => {
        if (projection.kind !== ProjectionKind.Render) {
          throw new Error('expected a rendered projection');
        }
        return renderedTags(plan, projection.use);
      })
    ).toEqual(tags);
  }
);

function renderedTags(plan: ModulePlan, use: QrlUse): string[] {
  const qrl = plan.qrls.find((qrl) => qrl.id === use.qrl);
  if (qrl?.body.b !== QrlBodyKind.Program) {
    throw new Error('expected a render program');
  }
  const body = plan.programs[qrl.body.program].body;
  if (body.kind !== ProgramBodyKind.Ops) {
    throw new Error('expected render operations');
  }
  const visit = (op: Op): string[] => {
    if (op.op === OpKind.Element) {
      return [op.tag, ...op.children.flatMap(visit)];
    }
    if (op.op === OpKind.Branch) {
      return [
        ...renderedTags(plan, op.then),
        ...(op.else === null ? [] : renderedTags(plan, op.else)),
      ];
    }
    return [];
  };
  return body.ops.flatMap(visit);
}

function componentProjectionNames(plan: ModulePlan): string[] {
  return componentProjections(plan).map((projection) => projection.name);
}

function componentProjections(plan: ModulePlan) {
  return plan.programs
    .flatMap((program) => (program.body.kind === ProgramBodyKind.Ops ? program.body.ops : []))
    .flatMap((op) => (op.op === OpKind.Component ? op.projections : []));
}
