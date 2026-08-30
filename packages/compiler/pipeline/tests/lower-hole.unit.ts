import { describe, expect, test } from 'vitest';
import {
  ArgPass,
  BindingScope,
  ExprKind,
  CaptureAccess,
  OpKind,
  QrlPayloadKind,
  ResumeKind,
  ValueKind,
  VarKind,
  type Op,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import type { Expression } from 'oxc-parser';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { lowerText } from '../analyse/lower-hole';
import { createLowerContext, type LowerContext } from '../analyse/lower-context';
import { LocalKind } from '../analyse/lower-setup';
import { emptyModulePlan } from './fixtures';

function holeFor(expression: string, shape: (ctx: LowerContext) => void = () => {}) {
  const source = `const a = (${expression});`;
  const parsed = parseModule('t.tsx', source);
  expect(parsed.errors).toEqual([]);
  const statement = parsed.program.body[0];
  if (statement.type !== 'VariableDeclaration') {
    throw new Error('expected a variable declaration');
  }
  const node = unwrapExpression(statement.declarations[0].init);
  if (node === null) {
    throw new Error('expected an expression');
  }
  const ctx = createLowerContext(emptyModulePlan('t.tsx', source), 't.tsx', undefined);
  shape(ctx);
  const [op] = lowerText(node as Expression, ctx);
  if (op === undefined) {
    throw new Error('expected a text op');
  }
  return { op, ctx };
}

function withSignalLocal(ctx: LowerContext): void {
  ctx.plan.bindings.push({
    id: 0,
    name: 'count',
    scope: BindingScope.Local,
    varKind: VarKind.Const,
    declarationRange: null,
  });
  ctx.locals = new Map([
    ['count', { kind: LocalKind.Signal, access: CaptureAccess.Direct, slot: 0, binding: 0 }],
  ]);
}

function withProps(ctx: LowerContext): void {
  ctx.plan.bindings.push({
    id: 0,
    name: 'props',
    scope: BindingScope.Param,
    varKind: null,
    declarationRange: null,
  });
  ctx.propsParamName = 'props';
  ctx.bindingNames = new Set(['props']);
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
    expect(holeValue(op)).toMatchObject({
      v: ValueKind.Read,
      expr: { kind: ExprKind.Ir, ir: { kind: ValueIrKind.SignalRead, binding: 0 } },
    });
    expect(ctx.plan.qrls).toEqual([]);
  });

  test('a props member becomes a Computed hole with member IR and a Value-payload qrl', () => {
    const { op, ctx } = holeFor('props.title', withProps);
    const value = holeValue(op);
    if (value.v !== ValueKind.Computed) {
      throw new Error('expected a computed hole');
    }
    expect(value.expr).toEqual({
      kind: ExprKind.Ir,
      ir: {
        kind: ValueIrKind.Member,
        obj: { kind: ValueIrKind.BindingRead, binding: 0 },
        name: 'title',
      },
    });
    expect(ctx.plan.qrls).toHaveLength(1);
    expect(ctx.plan.qrls[0].payloadKind).toBe(QrlPayloadKind.Value);
    expect(ctx.plan.qrls[0].captures).toEqual([
      { binding: 0, access: CaptureAccess.ComponentProp },
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
    const value = holeValue(op);
    if (value.v !== ValueKind.Computed) {
      throw new Error('expected a computed hole');
    }
    expect(ctx.plan.qrls[0].captures).toEqual([{ binding: 0, access: CaptureAccess.Direct }]);
    expect(value.resume).toEqual({
      r: ResumeKind.Qrl,
      qrl: { qrl: 'segment_0', args: [{ pass: ArgPass.Binding, binding: 0 }] },
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

  test('a plain literal concat decomposes; a markup-bearing literal stays one computed hole', () => {
    const decompose = (expression: string, shape: (ctx: LowerContext) => void) => {
      const source = `const a = (${expression});`;
      const parsed = parseModule('t.tsx', source);
      const statement = parsed.program.body[0];
      if (statement.type !== 'VariableDeclaration') {
        throw new Error('expected a variable declaration');
      }
      const ctx = createLowerContext(emptyModulePlan('t.tsx', source), 't.tsx', undefined);
      shape(ctx);
      return lowerText(unwrapExpression(statement.declarations[0].init) as Expression, ctx);
    };
    expect(decompose("'Count: ' + count.value", withSignalLocal).map((op) => op.op)).toEqual([
      OpKind.Static,
      OpKind.Hole,
    ]);
    // `<`/`&` in the literal would stream raw into SSR — the computed hole escapes at runtime.
    expect(decompose("'<b> & ' + count.value", withSignalLocal).map((op) => op.op)).toEqual([
      OpKind.Hole,
    ]);
  });

  test('an expression capturing a module binding throws', () => {
    expect(() =>
      holeFor('title', (ctx) => {
        ctx.plan.bindings.push({
          id: 0,
          name: 'title',
          scope: BindingScope.Module,
          varKind: VarKind.Const,
          declarationRange: null,
        });
        ctx.bindingNames = new Set(['title']);
      })
    ).toThrow('an expression capturing "title"');
  });
});
