import { assert, test } from 'vitest';
import { extractParamNames } from './extract-params';

test('should parse no params', () => {
  assert.deepEqual(extractParamNames('/a/b/c'), []);
});

test('should parse one param', () => {
  assert.deepEqual(extractParamNames('/a/[b]/[c]'), ['b', 'c']);
});

test('should parse param in mid urls', () => {
  assert.deepEqual(extractParamNames('/a/pre[b]post/pre[c]/[d]post'), ['b', 'c', 'd']);
});

test('should parse rest param', () => {
  assert.deepEqual(extractParamNames('/a/[...b]'), ['b']);
});
