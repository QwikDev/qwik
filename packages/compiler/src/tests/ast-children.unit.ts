import { expect, test } from 'vitest';
import type { Node } from 'oxc-parser';
import { forEachChild } from '../analyse/ast/ast-types';
import { parseModule } from '../analyse/ast/parse';

function parseCall(code: string) {
  const statement = parseModule('children.ts', code).program.body[0];
  if (statement.type !== 'ExpressionStatement' || statement.expression.type !== 'CallExpression') {
    throw new Error('expected a call');
  }
  return statement.expression;
}

test('visits every child value in key order, skipping positions and the parent link', () => {
  const call = { ...parseCall('f(1, 2);'), parent: null } as Node;
  const visited: [string, unknown][] = [];
  forEachChild(call, (child, key) => {
    visited.push([key, child]);
  });
  expect(visited).toEqual(
    Object.entries(call).filter(
      ([key]) => !['type', 'start', 'end', 'range', 'parent'].includes(key)
    )
  );
  expect(visited.map(([key]) => key)).toContain('arguments');
});

test('stops at the first truthy result and returns it', () => {
  const call = parseCall('f(1, 2);');
  const keys: string[] = [];
  const found = forEachChild(call, (child, key) => {
    keys.push(key);
    return Array.isArray(child) ? child : null;
  });
  expect(found).toBe(call.arguments);
  expect(keys.at(-1)).toBe('arguments');
  expect(keys).not.toContain('optional');
  expect(forEachChild(call, () => false)).toBeUndefined();
});
