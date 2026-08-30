import { describe, expect, test } from 'vitest';
import {
  ArgPass,
  BindingScope,
  CaptureAccess,
  OpKind,
  ProgramBodyKind,
  QrlBodyKind,
} from '../schema';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { createLowerContext } from '../analyse/lower-context';
import { LocalKind, type SetupLocal } from '../analyse/lower-setup';
import { lowerJsx } from '../analyse/lower-jsx';
import { emptyModulePlan } from './fixtures';

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
  const parsed = parseModule('t.tsx', `const a = ${jsx};`);
  expect(parsed.errors).toEqual([]);
  const statement = parsed.program.body[0];
  if (statement.type !== 'VariableDeclaration') {
    throw new Error('expected a variable declaration');
  }
  const element = unwrapExpression(statement.declarations[0].init);
  if (element?.type !== 'JSXElement') {
    throw new Error('expected a JSX element');
  }
  const ctx = createLowerContext(emptyModulePlan('t.tsx', `const a = ${jsx};`), 't.tsx', undefined);
  ctx.locals = new Map([
    ['show', SHOW_LOCAL],
    ['count', COUNT_LOCAL],
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

  test('an arm reading the props param records a trailing ComponentProp capture', () => {
    const { op, ctx } = lower('<div>{show.value ? <b>{props.title}</b> : null}</div>', (ctx) => {
      ctx.plan.bindings.push({
        id: 0,
        name: 'props',
        scope: BindingScope.Param,
        varKind: null,
        declarationRange: null,
      });
      ctx.propsParamName = 'props';
    });
    const arm = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:then');
    expect(arm?.captures).toEqual([{ binding: 0, access: CaptureAccess.ComponentProp }]);
    expect(op.op === OpKind.Element && op.children[0]).toMatchObject({
      op: OpKind.Branch,
      then: { qrl: arm?.id, args: [{ pass: ArgPass.Props }] },
    });
  });

  test('an arm reading a module binding refuses', () => {
    expect(() =>
      lower('<div>{show.value ? <b>{title}</b> : null}</div>', (ctx) => {
        ctx.bindingNames = new Set(['title']);
      })
    ).toThrow('a branch arm capturing "title"');
  });
});
