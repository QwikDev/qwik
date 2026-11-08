import { describe, expect, it } from 'vitest';
import { rewritePropsFieldReferences } from '../../../src/optimizer/rewrite/props-field-rewrite.js';

describe('props-field-rewrite', () => {
  it('rewrites computed member keys but not static property names', () => {
    const result = rewritePropsFieldReferences(
      'obj[count] + obj.count + count',
      new Map([['count', 'count']]),
      {}
    ).code;

    expect(result).toBe('obj[_rawProps.count] + obj.count + _rawProps.count');
  });

  it('rewrites shorthand object properties with explicit keys', () => {
    const result = rewritePropsFieldReferences(
      '({ count })',
      new Map([['count', 'count']]),
      {}
    ).code;

    expect(result).toBe('({ count: _rawProps.count })');
  });
});
