import { describe, expect, test } from 'vitest';
import { CaptureAccess, ReadRole, type LocalId } from '../schema';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { collectCaptures } from '../analyse/ast/capture-analysis';
import { LocalKind, type SetupLocal } from '../analyse/locals';
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
  test('the same indexed references follow the current lowering context', () => {
    const source = 'const count = 0; count + count;';
    const { program } = parseModule('t.tsx', source);
    const { ctx } = createTestLowerContext(program, source);
    const expression = program.body[1];
    const binding = ctx.plan.bindings[0].id;
    expect(collectCaptures(expression, ctx, new Set()).other).toBe('count');
    const local = { ...COUNT_LOCAL, binding };
    ctx.locals = new Map([[binding, local]]);
    const refs = collectCaptures(expression, ctx, new Set());
    expect(refs.other).toBeNull();
    expect(refs.locals[0].local).toBe(local);
    expect(refs.locals[0].reads.map(({ range }) => source.slice(...range))).toEqual([
      'count',
      'count',
    ]);
    expect(collectCaptures(expression, ctx, new Set([binding])).locals).toEqual([]);
  });

  test('a setup local is collected with its SetupLocal row', () => {
    const refs = refsOf('() => count.value++', { count: true });
    expect(refs).toMatchObject({
      propsReads: [],
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

  test('capture reads preserve shorthand roles from the binding graph', () => {
    const refs = refsOf('() => ({ count, explicit: count, [count]: count })', { count: true });
    expect(refs.locals[0].reads.map(({ role }) => role)).toEqual([
      ReadRole.Shorthand,
      ReadRole.Read,
      ReadRole.Read,
      ReadRole.Read,
    ]);
  });

  test.each([
    ['count()', ReadRole.Call],
    ['(count)()', ReadRole.Call],
    ['count?.()', ReadRole.Call],
    ['count`tag`', ReadRole.Call],
    ['count.method()', ReadRole.Read],
    ['count.call(null)', ReadRole.Read],
    ['new count()', ReadRole.Read],
  ])('classifies the receiver role of %s', (expression, role) => {
    expect(refsOf(expression, { count: true }).locals[0].reads[0].role).toBe(role);
  });

  test('props reads retain their locations without becoming local entries', () => {
    const refs = refsOf('(value = props.initial) => props.onSave$(value)', { props: true });
    expect(refs).toEqual({
      propsReads: [
        [expect.any(Number), expect.any(Number)],
        [expect.any(Number), expect.any(Number)],
      ],
      locals: [],
      other: null,
    });
    expect(refs.propsReads.map(([start, end]) => end - start)).toEqual([5, 5]);
    expect(refs.propsReads[0][1]).toBeLessThan(refs.propsReads[1][0]);
    expect(refsOf('(props) => props.title', { props: true }).propsReads).toEqual([]);
  });

  test('a module binding lands in other', () => {
    expect(refsOf('title').other).toBe('title');
  });

  test('handler params shadow outer names', () => {
    expect(refsOf('(count) => count.value', { count: true })).toEqual({
      propsReads: [],
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
      propsReads: [],
      locals: [],
      other: null,
    });
  });
});
