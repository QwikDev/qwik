/**
 * Debug: test _hf renumbering
 */
import { describe, it, expect } from 'vitest';
import { compareAst } from '../../src/testing/ast-compare.js';

describe('hf renumber', () => {
  it('simple case', () => {
    const expected = `
const _hf0 = (p0) => p0.a;
const _hf0_str = "p0.a";
const _hf1 = (p0) => p0.b;
const _hf1_str = "p0.b";
f(_hf0, _hf0_str);
g(_hf1, _hf1_str);
`;
    const actual = `
const _hf0 = (p0) => p0.b;
const _hf0_str = "p0.b";
const _hf1 = (p0) => p0.a;
const _hf1_str = "p0.a";
f(_hf1, _hf1_str);
g(_hf0, _hf0_str);
`;
    const result = compareAst(expected, actual, 'test.ts');
    console.log('simple match:', result.match);
    expect(result.match).toBe(true);
  });
});
