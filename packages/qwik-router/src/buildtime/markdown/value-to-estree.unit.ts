import { assert, test } from 'vitest';
import { valueToEstree } from './value-to-estree';

test('primitives', () => {
  assert.deepEqual(valueToEstree(null), { type: 'Literal', value: null });
  assert.deepEqual(valueToEstree(true), { type: 'Literal', value: true });
  assert.deepEqual(valueToEstree('hi'), { type: 'Literal', value: 'hi' });
  assert.deepEqual(valueToEstree(42), { type: 'Literal', value: 42 });
});

test('undefined becomes an identifier', () => {
  assert.deepEqual(valueToEstree(undefined), { type: 'Identifier', name: 'undefined' });
});

test('negative and non-finite numbers', () => {
  assert.deepEqual(valueToEstree(-3), {
    type: 'UnaryExpression',
    operator: '-',
    prefix: true,
    argument: { type: 'Literal', value: 3 },
  });
  assert.deepEqual(valueToEstree(Infinity), { type: 'Identifier', name: 'Infinity' });
  assert.deepEqual(valueToEstree(NaN), { type: 'Identifier', name: 'NaN' });
});

test('arrays and nested objects', () => {
  assert.deepEqual(valueToEstree([1, 'a']), {
    type: 'ArrayExpression',
    elements: [
      { type: 'Literal', value: 1 },
      { type: 'Literal', value: 'a' },
    ],
  });
  const estree = valueToEstree({ title: 'Docs', meta: { level: 2 } }) as any;
  assert.equal(estree.type, 'ObjectExpression');
  assert.equal(estree.properties[0].key.value, 'title');
  assert.equal(estree.properties[0].value.value, 'Docs');
  assert.equal(estree.properties[1].value.properties[0].value.value, 2);
});

test('dates become new Date() expressions', () => {
  const date = new Date('2026-01-01T00:00:00Z');
  assert.deepEqual(valueToEstree(date), {
    type: 'NewExpression',
    callee: { type: 'Identifier', name: 'Date' },
    arguments: [{ type: 'Literal', value: date.getTime() }],
  });
});

test('unsupported values throw', () => {
  assert.throws(() => valueToEstree(() => 0));
  assert.throws(() => valueToEstree(Symbol('nope')));
});
