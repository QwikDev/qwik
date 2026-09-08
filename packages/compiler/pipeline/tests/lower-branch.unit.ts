import { describe, expect, test } from 'vitest';
import { ArgPass, CaptureAccess, OpKind, ProgramBodyKind, QrlBodyKind } from '../schema';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { createLowerContext } from '../analyse/lower-context';
import { LocalKind, type SetupLocal } from '../analyse/locals';
import { lowerJsx } from '../analyse/lower-jsx';
import { createTestLowerContext } from './fixtures';

const SHOW_LOCAL: SetupLocal = {
  kind: LocalKind.Signal,
  access: CaptureAccess.Direct,
  slot: 0,
  binding: 0,
};
const COUNT_LOCAL: SetupLocal = {
  kind: LocalKind.Signal,
  access: CaptureAccess.Direct,
  slot: 1,
  binding: 1,
};

function lower(
  jsx: string,
  shape: (ctx: ReturnType<typeof createLowerContext>) => void = () => {}
) {
  const source = `const show = null; const count = null; const title = null; const render = (props) => ${jsx};`;
  const parsed = parseModule('t.tsx', source);
  expect(parsed.errors).toEqual([]);
  const statement = parsed.program.body[3];
  if (statement.type !== 'VariableDeclaration') {
    throw new Error('expected a variable declaration');
  }
  const render = unwrapExpression(statement.declarations[0].init);
  const element = render?.type === 'ArrowFunctionExpression' ? unwrapExpression(render.body) : null;
  if (element?.type !== 'JSXElement') {
    throw new Error('expected a JSX element');
  }
  const { ctx } = createTestLowerContext(parsed.program, source);
  ctx.locals = new Map([
    [0, SHOW_LOCAL],
    [1, COUNT_LOCAL],
  ]);
  shape(ctx);
  return { op: lowerJsx(element, ctx), ctx };
}

describe('lowerBranch / arm captures', () => {
  test('a static arm lowers to a Branch op', () => {
    const { op } = lower('<div>{show.value ? <b>on</b> : null}</div>');
    expect(op.op === OpKind.Element && op.children[0].op).toBe(OpKind.Branch);
  });

  test('a mixed JSX and expression conditional lowers both arms', () => {
    const { ctx } = lower("<div>{show.value ? <b>on</b> : 'off'}</div>");
    const arm = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:else');
    if (arm?.body.b !== QrlBodyKind.Program) {
      throw new Error('expected an else arm program');
    }
    expect(ctx.plan.programs[arm.body.program].body).toMatchObject({
      kind: ProgramBodyKind.Ops,
      ops: [{ op: OpKind.Hole }],
    });
  });

  test('an arm reading a setup local records a Direct capture on the arm qrl', () => {
    const { op, ctx } = lower('<div>{show.value ? <b>{count.value}</b> : null}</div>');
    const arm = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:then');
    expect(arm?.captures).toEqual([{ binding: 1, access: CaptureAccess.Direct }]);
    expect(op.op === OpKind.Element && op.children[0]).toMatchObject({
      op: OpKind.Branch,
      then: { qrl: arm?.id, args: [{ pass: ArgPass.Binding, binding: 1 }] },
    });
  });

  test.each([
    '<div>{show.value ? <><b>on</b><i>more</i></> : null}</div>',
    '<div>{show.value && <><b>on</b><i>more</i></>}</div>',
  ])('fragment arms use the shared child lowering: %s', (jsx) => {
    const { op, ctx } = lower(jsx);
    expect(op.op === OpKind.Element && op.children[0].op).toBe(OpKind.Branch);
    const arm = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:then');
    if (arm?.body.b !== QrlBodyKind.Program) {
      throw new Error('expected an arm program');
    }
    expect(ctx.plan.programs[arm.body.program].body).toMatchObject({
      kind: ProgramBodyKind.Ops,
      ops: [
        { op: OpKind.Element, tag: 'b' },
        { op: OpKind.Element, tag: 'i' },
      ],
    });
  });

  test('nested ternaries lower as nested branches', () => {
    const { op, ctx } = lower(
      '<div>{show.value ? (count.value ? <b>on</b> : <i>off</i>) : null}</div>'
    );
    expect(op.op === OpKind.Element && op.children[0].op).toBe(OpKind.Branch);
    const arm = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:then');
    if (arm?.body.b !== QrlBodyKind.Program) {
      throw new Error('expected an arm program');
    }
    expect(ctx.plan.programs[arm.body.program].body).toMatchObject({
      kind: ProgramBodyKind.Ops,
      ops: [{ op: OpKind.Branch }],
    });
    expect(arm.captures).toEqual([{ binding: 1, access: CaptureAccess.Direct }]);
  });

  test('text-only ternaries stay a single expression', () => {
    const { op } = lower("<div>{show.value ? (count.value ? 'one' : 'two') : 'off'}</div>");
    expect(op.op === OpKind.Element && op.children[0].op).toBe(OpKind.Hole);
  });

  test('a text call in an arm keeps using expression lowering', () => {
    const { ctx } = lower('<div>{show.value ? <b>on</b> : count.value.toFixed()}</div>');
    const arm = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:else');
    if (arm?.body.b !== QrlBodyKind.Program) {
      throw new Error('expected an arm program');
    }
    expect(ctx.plan.programs[arm.body.program].body).toMatchObject({
      kind: ProgramBodyKind.Ops,
      ops: [{ op: OpKind.Hole }],
    });
  });

  test.each([
    "<div>{show.value(<b />) ? 'on' : 'off'}</div>",
    '<div>{show.value(<b />) ? <i>on</i> : null}</div>',
  ])('JSX inside a condition cannot leak into a JavaScript payload: %s', (jsx) => {
    expect(() => lower(jsx)).toThrow('JSX inside an expression value');
  });

  test('an arm reading the props param records a trailing ComponentProp capture', () => {
    const { op, ctx } = lower('<div>{show.value ? <b>{props.title}</b> : null}</div>', (ctx) => {
      ctx.propsBinding = ctx.plan.bindings.find((binding) => binding.name === 'props')!.id;
    });
    const arm = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:then');
    expect(arm?.captures).toEqual([
      { binding: ctx.propsBinding, access: CaptureAccess.ComponentProp },
    ]);
    expect(op.op === OpKind.Element && op.children[0]).toMatchObject({
      op: OpKind.Branch,
      then: { qrl: arm?.id, args: [{ pass: ArgPass.Props }] },
    });
  });

  test('an arm reading a module binding does not capture it', () => {
    const { ctx } = lower('<div>{show.value ? <b>{title}</b> : null}</div>');
    expect(ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:then')?.captures).toEqual([]);
    expect(
      ctx.plan.payloads
        .flatMap((payload) => payload.reads)
        .some((read) => ctx.plan.bindings[read.binding].name === 'title')
    ).toBe(true);
  });
});
