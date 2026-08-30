import { describe, expect, test } from 'vitest';
import { BindingScope, CaptureAccess, VarKind } from '../schema';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { collectCaptures } from '../analyse/ast/capture-analysis';
import { createLowerContext, type LowerContext } from '../analyse/lower-context';
import { LocalKind, type SetupLocal } from '../analyse/lower-setup';
import { emptyModulePlan } from './fixtures';

const COUNT_LOCAL: SetupLocal = {
  kind: LocalKind.Signal,
  access: CaptureAccess.Direct,
  slot: 0,
  binding: 1,
};

function contextWith(overrides: Partial<LowerContext>): LowerContext {
  const plan = emptyModulePlan('t.tsx');
  plan.bindings.push({
    id: 0,
    name: 'title',
    scope: BindingScope.Module,
    varKind: VarKind.Const,
    declarationRange: null,
  });
  return { ...createLowerContext(plan, 't.tsx', undefined), ...overrides };
}

function refsOf(expression: string, ctx: LowerContext, localNames: string[] = []) {
  const parsed = parseModule('t.tsx', `const a = (${expression});`);
  expect(parsed.errors).toEqual([]);
  const statement = parsed.program.body[0];
  if (statement.type !== 'VariableDeclaration') {
    throw new Error('expected a variable declaration');
  }
  const node = unwrapExpression(statement.declarations[0].init);
  if (node === null) {
    throw new Error('expected an expression');
  }
  return collectCaptures(node, ctx, new Set(localNames));
}

describe('collectCaptures', () => {
  test('a setup local is collected with its SetupLocal row', () => {
    const ctx = contextWith({ locals: new Map([['count', COUNT_LOCAL]]) });
    expect(refsOf('() => count.value++', ctx)).toEqual({
      props: false,
      locals: [{ name: 'count', local: COUNT_LOCAL }],
      other: null,
    });
  });

  test('a repeated read dedupes to one entry in first-read order', () => {
    const ctx = contextWith({ locals: new Map([['count', COUNT_LOCAL]]) });
    expect(refsOf('() => count.value + count.value', ctx).locals).toHaveLength(1);
  });

  test('the props param sets the props flag, not a local entry', () => {
    const ctx = contextWith({ propsParamName: 'props' });
    expect(refsOf('props.title', ctx)).toEqual({ props: true, locals: [], other: null });
  });

  test('a module binding lands in other', () => {
    expect(refsOf('title', contextWith({})).other).toBe('title');
  });

  test('handler params shadow outer names', () => {
    const ctx = contextWith({ locals: new Map([['count', COUNT_LOCAL]]) });
    expect(refsOf('(count) => count.value', ctx, ['count'])).toEqual({
      props: false,
      locals: [],
      other: null,
    });
  });

  test('member properties and object keys are not references', () => {
    const ctx = contextWith({ locals: new Map([['count', COUNT_LOCAL]]) });
    // `.count` and `{ count: 1 }` never touch the outer `count`.
    expect(refsOf('obj.count', ctx).locals).toEqual([]);
    expect(refsOf('({ count: 1 })', ctx).locals).toEqual([]);
  });

  test('unknown globals are ignored entirely', () => {
    expect(refsOf('() => console.log(1)', contextWith({}))).toEqual({
      props: false,
      locals: [],
      other: null,
    });
  });
});
