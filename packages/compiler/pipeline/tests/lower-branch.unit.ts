import { describe, expect, test } from 'vitest';
import { OpKind } from '../schema';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { createLowerContext } from '../analyse/lower-context';
import { LocalKind, type SetupLocal } from '../analyse/lower-setup';
import { lowerJsx } from '../analyse/lower-jsx';
import { emptyModulePlan } from './fixtures';

const SHOW_LOCAL: SetupLocal = { kind: LocalKind.Signal, slot: 0, binding: 0 };
const COUNT_LOCAL: SetupLocal = { kind: LocalKind.Signal, slot: 1, binding: 1 };

function lower(jsx: string) {
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
  return { op: lowerJsx(element, ctx), ctx };
}

describe('lowerBranch / arm captures', () => {
  test('a static arm lowers to a Branch op', () => {
    const { op } = lower('<div>{show.value ? <b>on</b> : null}</div>');
    expect(op.op === OpKind.Element && op.children[0].op).toBe(OpKind.Branch);
  });

  test('an arm reading a setup local refuses — arm chunks cannot capture yet', () => {
    expect(() => lower('<div>{show.value ? <b>{count.value}</b> : null}</div>')).toThrow(
      'a branch arm capturing "count"'
    );
  });
});
