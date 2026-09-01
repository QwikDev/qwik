import { describe, expect, test } from 'vitest';
import { CaptureAccess, type LocalId } from '../schema';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { collectCaptures } from '../analyse/ast/capture-analysis';
import { LocalKind, type SetupLocal } from '../analyse/lower-setup';
import { createTestLowerContext } from './fixtures';

const COUNT_LOCAL: SetupLocal = {
  kind: LocalKind.Signal,
  access: CaptureAccess.Direct,
  slot: 0,
  binding: 1,
};

function refsOf(expression: string, options: { count?: boolean; props?: boolean } = {}) {
  const source = `const title = null; const count = null; const render = (props) => (${expression});`;
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
  const binding = (name: string): LocalId =>
    ctx.plan.bindings.find((candidate) => candidate.name === name)!.id;
  if (options.count) {
    ctx.locals = new Map([[binding('count'), COUNT_LOCAL]]);
  }
  if (options.props) {
    ctx.propsBinding = binding('props');
  }
  return collectCaptures(node, ctx, new Set<LocalId>());
}

describe('collectCaptures', () => {
  test('a setup local is collected with its SetupLocal row', () => {
    const refs = refsOf('() => count.value++', { count: true });
    expect(refs).toMatchObject({
      props: false,
      locals: [{ name: 'count', local: COUNT_LOCAL }],
      other: null,
    });
    expect(refs.locals[0].reads).toHaveLength(1);
  });

  test('a repeated read dedupes to one entry collecting every occurrence', () => {
    const locals = refsOf('() => count.value + count.value', { count: true }).locals;
    expect(locals).toHaveLength(1);
    expect(locals[0].reads).toHaveLength(2);
  });

  test('the props param sets the props flag, not a local entry', () => {
    expect(refsOf('props.title', { props: true })).toEqual({
      props: true,
      locals: [],
      other: null,
    });
  });

  test('a module binding lands in other', () => {
    expect(refsOf('title').other).toBe('title');
  });

  test('handler params shadow outer names', () => {
    expect(refsOf('(count) => count.value', { count: true })).toEqual({
      props: false,
      locals: [],
      other: null,
    });
  });

  test('member properties and object keys are not references', () => {
    expect(refsOf('obj.count', { count: true }).locals).toEqual([]);
    expect(refsOf('({ count: 1 })', { count: true }).locals).toEqual([]);
  });

  test('unknown globals are ignored entirely', () => {
    expect(refsOf('() => console.log(1)')).toEqual({
      props: false,
      locals: [],
      other: null,
    });
  });
});
