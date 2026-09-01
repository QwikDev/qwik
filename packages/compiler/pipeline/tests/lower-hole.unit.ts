import { describe, expect, test } from 'vitest';
import {
  ArgPass,
  ExprKind,
  CaptureAccess,
  OpKind,
  QrlPayloadKind,
  ResumeKind,
  ValueKind,
  type Op,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import type { Expression } from 'oxc-parser';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { lowerText } from '../analyse/lower-hole';
import type { LowerContext } from '../analyse/lower-context';
import { LocalKind } from '../analyse/lower-setup';
import { createTestLowerContext } from './fixtures';

function lowerFor(expression: string, shape: (ctx: LowerContext) => void = () => {}) {
  const source = `const count = null; const title = null; const render = (props) => (${expression});`;
  const parsed = parseModule('t.tsx', source);
  expect(parsed.errors).toEqual([]);
  const statement = parsed.program.body[2];
  if (statement.type !== 'VariableDeclaration') {
    throw new Error('expected a variable declaration');
  }
  const render = unwrapExpression(statement.declarations[0].init);
  const node = render?.type === 'ArrowFunctionExpression' ? unwrapExpression(render.body) : null;
  if (node === null) {
    throw new Error('expected an expression');
  }
  const { ctx } = createTestLowerContext(parsed.program, source);
  shape(ctx);
  return { ops: lowerText(node as Expression, ctx), ctx };
}

function holeFor(expression: string, shape: (ctx: LowerContext) => void = () => {}) {
  const { ops, ctx } = lowerFor(expression, shape);
  const [op] = ops;
  if (op === undefined) {
    throw new Error('expected a text op');
  }
  return { op, ctx };
}

function withSignalLocal(ctx: LowerContext): void {
  const count = ctx.plan.bindings.find((binding) => binding.name === 'count')!.id;
  ctx.locals = new Map([
    [count, { kind: LocalKind.Signal, access: CaptureAccess.Direct, slot: 0, binding: count }],
  ]);
}

function withProps(ctx: LowerContext): void {
  ctx.propsBinding = ctx.plan.bindings.find((binding) => binding.name === 'props')!.id;
}

function holeValue(op: Op) {
  if (op.op !== OpKind.Hole) {
    throw new Error('expected a hole op');
  }
  return op.value;
}

describe('lowerText', () => {
  test('a signal .value read becomes a Read hole with SignalRead IR and no qrl', () => {
    const { op, ctx } = holeFor('count.value', withSignalLocal);
    const count = ctx.plan.bindings.find((binding) => binding.name === 'count')!.id;
    expect(holeValue(op)).toMatchObject({
      v: ValueKind.Read,
      expr: { kind: ExprKind.Ir, ir: { kind: ValueIrKind.SignalRead, binding: count } },
    });
    expect(ctx.plan.qrls).toEqual([]);
  });

  test('a props member becomes a Computed hole with member IR and a Value-payload qrl', () => {
    const { op, ctx } = holeFor('props.title', withProps);
    const props = ctx.propsBinding!;
    const value = holeValue(op);
    if (value.v !== ValueKind.Computed) {
      throw new Error('expected a computed hole');
    }
    expect(value.expr).toEqual({
      kind: ExprKind.Ir,
      ir: {
        kind: ValueIrKind.Member,
        obj: { kind: ValueIrKind.BindingRead, binding: props },
        name: 'title',
      },
    });
    expect(ctx.plan.qrls).toHaveLength(1);
    expect(ctx.plan.qrls[0].payloadKind).toBe(QrlPayloadKind.Value);
    expect(ctx.plan.qrls[0].captures).toEqual([
      { binding: props, access: CaptureAccess.ComponentProp },
    ]);
  });

  test('an IR-uncoverable expression keeps a Js payload', () => {
    const { op } = holeFor('props.list.join(",")', withProps);
    const value = holeValue(op);
    if (value.v !== ValueKind.Computed) {
      throw new Error('expected a computed hole');
    }
    expect(value.expr.kind).toBe(ExprKind.Js);
  });

  test('an expression capturing a signal local gets a Direct capture and Binding arg', () => {
    const { op, ctx } = holeFor('count.value + 1', withSignalLocal);
    const count = ctx.plan.bindings.find((binding) => binding.name === 'count')!.id;
    const value = holeValue(op);
    if (value.v !== ValueKind.Computed) {
      throw new Error('expected a computed hole');
    }
    expect(ctx.plan.qrls[0].captures).toEqual([{ binding: count, access: CaptureAccess.Direct }]);
    expect(value.resume).toEqual({
      r: ResumeKind.Qrl,
      qrl: { qrl: 'segment_0', args: [{ pass: ArgPass.Binding, binding: count }] },
    });
  });

  test('JSX anywhere inside the expression throws — a payload chunk cannot carry JSX', () => {
    expect(() => holeFor('count.value ? <>on</> : null', withSignalLocal)).toThrow(
      'JSX inside an expression value'
    );
    expect(() => holeFor('[1, 2].map(() => <li>x</li>)')).toThrow('JSX inside an expression value');
    expect(() => holeFor('<span>top</span>')).toThrow(
      'the expression "JSXElement" outside a child position'
    );
  });

  test('a concat with a dynamic operand stays one computed hole; all-literal concats fold', () => {
    const lower = (expression: string, shape?: (ctx: LowerContext) => void) =>
      lowerFor(expression, shape).ops;
    // the extracted operand renders alone — the stringify flag keeps the JS `+` coercion
    const decomposed = lower("'Count: ' + count.value", withSignalLocal);
    expect(decomposed.map((op) => op.op)).toEqual([OpKind.Static, OpKind.Hole]);
    expect(decomposed[1]).toMatchObject({ stringify: true });
    expect(lower('count.value', withSignalLocal)[0]).toMatchObject({ stringify: false });
    expect(lower("'a' + 1 + 'b'")).toEqual([{ op: OpKind.Static, html: 'a1b' }]);
    // `1 + 2` is numeric addition — folding the literals as text would print '12'
    expect(lower('1 + 2').map((op) => op.op)).toEqual([OpKind.Hole]);
    // `<`/`&` in the literal would stream raw into SSR — the computed hole escapes at runtime.
    expect(lower("'<b> & ' + 'x'").map((op) => op.op)).toEqual([OpKind.Hole]);
  });

  test('an expression capturing a module binding throws', () => {
    expect(() => holeFor('title')).toThrow('an expression capturing "title"');
  });
});
