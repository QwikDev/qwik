import { describe, expect, test } from 'vitest';
import {
  BindingScope,
  CaptureAccess,
  EachSourceKind,
  ExprKind,
  IndexMode,
  OpKind,
  ProgramBodyKind,
  QrlBodyKind,
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
  ctx.locals = new Map([
    ['items', { kind: LocalKind.Signal, access: CaptureAccess.Direct, slot: 0, binding: 0 }],
  ]);
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

  test('index mode derives from who captures the index', () => {
    const eachOf = (jsx: string) => {
      const { op } = lower(jsx);
      const each = op.op === OpKind.Element ? op.children[0] : null;
      if (each?.op !== OpKind.Each) {
        throw new Error('expected an Each op');
      }
      return each;
    };
    expect(eachOf(ROW).index).toBe(IndexMode.None);
    expect(
      eachOf('<ul>{items.value.map((item, i) => <li key={item.id}>{i}</li>)}</ul>').index
    ).toBe(IndexMode.Effects);
    expect(
      eachOf(
        '<ul>{items.value.map((item, i) => <li key={item.id} onClick$={() => console.log(i)}>x</li>)}</ul>'
      ).index
    ).toBe(IndexMode.Escapes);
  });

  test('destructured names in an opaque expression rewrite through payload reads', () => {
    const source =
      "<ul>{items.value.map(({ id, label }) => <li key={id}>{label + '!' + id}</li>)}</ul>";
    const { ctx } = lower(source);
    const text = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'text');
    if (text?.body.b !== QrlBodyKind.Expr || text.body.expr.kind !== ExprKind.Js) {
      throw new Error('expected a Js-payload text segment');
    }
    // one container capture despite two aliases
    expect(text.captures).toHaveLength(1);
    const payload = ctx.plan.payloads[text.body.expr.payload];
    expect(payload.reads).toEqual([
      {
        range: expect.anything(),
        binding: text.captures[0].binding,
        role: 'read',
        memberPath: ['label'],
      },
      {
        range: expect.anything(),
        binding: text.captures[0].binding,
        role: 'read',
        memberPath: ['id'],
      },
    ]);
  });

  test('inline rows interpolate lexical params; reactive reads become capturing holes', () => {
    const inline = lower("<ul>{['a'].map((item, index) => <li>{index}</li>)}</ul>");
    const hole = (() => {
      const each = inline.op.op === OpKind.Element ? inline.op.children[0] : null;
      if (each?.op !== OpKind.Each || each.row.r !== RowKind.Inline) {
        throw new Error('expected an inline Each');
      }
      const body = inline.ctx.plan.programs[each.row.program].body;
      if (body.kind !== ProgramBodyKind.Ops || body.ops[0].op !== OpKind.Element) {
        throw new Error('expected an element row');
      }
      return body.ops[0].children[0];
    })();
    expect(hole).toMatchObject({
      op: OpKind.Hole,
      value: { v: ValueKind.Computed, resume: { r: ResumeKind.Inline } },
    });
    expect(inline.ctx.plan.qrls).toEqual([]);
    const reactive = lower("<ul>{['a'].map((item) => <li>{item + items.value.length}</li>)}</ul>");
    expect(reactive.ctx.plan.qrls).toHaveLength(1);
    expect(reactive.ctx.plan.qrls[0].captures).toEqual([
      { binding: expect.any(Number), access: CaptureAccess.LoopValue },
      { binding: expect.any(Number), access: CaptureAccess.Direct },
    ]);
  });

  test('the loop param stays out of scope after the row', () => {
    const { ctx } = lower(ROW);
    expect(ctx.locals.has('item')).toBe(false);
  });
});
