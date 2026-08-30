import { describe, expect, test } from 'vitest';
import {
  BindingScope,
  CaptureAccess,
  EachSourceKind,
  OpKind,
  ResumeKind,
  RowKind,
  ValueKind,
  VarKind,
} from '../schema';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { createLowerContext } from '../analyse/lower-context';
import { LocalKind } from '../analyse/lower-setup';
import { lowerJsx } from '../analyse/lower-jsx';
import { emptyModulePlan } from './fixtures';

function lower(jsx: string) {
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
  const plan = emptyModulePlan('t.tsx', source);
  for (const [id, name] of [
    [0, 'items'],
    [1, 'item'],
  ] as const) {
    plan.bindings.push({
      id,
      name,
      scope: BindingScope.Local,
      varKind: VarKind.Const,
      declarationRange: null,
    });
  }
  const ctx = createLowerContext(plan, 't.tsx', undefined);
  ctx.locals = new Map([['items', { kind: LocalKind.Signal, slot: 0, binding: 0 }]]);
  return { op: lowerJsx(element, ctx), ctx };
}

const ROW = '<ul>{items.value.map((item) => <li key={item.id}>{item.label}</li>)}</ul>';

describe('lowerArray / reactive rows', () => {
  test('a keyed map lowers to an Each op with a chunk row', () => {
    const { op } = lower(ROW);
    expect(op.op === OpKind.Element && op.children[0]).toMatchObject({
      op: OpKind.Each,
      row: { r: RowKind.Chunk },
    });
  });

  test('a row text hole records a LoopValue capture on the text qrl', () => {
    const { ctx } = lower(ROW);
    const text = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'text');
    expect(text?.captures).toEqual([{ binding: 1, access: CaptureAccess.LoopValue }]);
  });

  test('a literal array source lowers to an inline row with no key and no qrl', () => {
    const { op, ctx } = lower("<ul>{['first', 'second'].map(() => <li>Item</li>)}</ul>");
    const each = op.op === OpKind.Element ? op.children[0] : null;
    if (each?.op !== OpKind.Each) {
      throw new Error('expected an Each op');
    }
    expect(each.source.s).toBe(EachSourceKind.Array);
    expect(each.source.value).toMatchObject({
      v: ValueKind.Computed,
      resume: { r: ResumeKind.Inline },
    });
    expect(each.key).toBeNull();
    if (each.row.r !== RowKind.Inline) {
      throw new Error('expected an inline row');
    }
    expect(each.row.renderId).toMatch(/^semantic_collectionRender_\d+_\d+_[a-z0-9]+$/);
    // Inline rows live in the component scope — no chunkable qrl row exists for them.
    expect(ctx.plan.qrls.filter((qrl) => qrl.ctxName === 'for:render')).toEqual([]);
  });

  test('the loop param stays out of scope after the row', () => {
    const { ctx } = lower(ROW);
    expect(ctx.locals.has('item')).toBe(false);
  });
});
