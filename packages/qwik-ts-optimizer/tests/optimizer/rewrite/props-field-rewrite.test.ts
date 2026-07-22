import { describe, expect, it } from 'vitest';
import { rewritePropsFieldReferences } from '../../../src/optimizer/rewrite/props-field-rewrite.js';

describe('props-field-rewrite', () => {
  it('preserves the segment-codegen behavior for member-expression properties', () => {
    const result = rewritePropsFieldReferences(
      'obj[count] + count',
      new Map([['count', 'count']]),
      {
        memberPropertyMode: 'all',
      },
    );

    expect(result).toBe('obj[count] + _rawProps.count');
  });

  it('preserves the rewrite-parent behavior for computed member-expression properties', () => {
    const result = rewritePropsFieldReferences(
      'obj[count] + count',
      new Map([['count', 'count']]),
      {
        memberPropertyMode: 'nonComputed',
      },
    );

    expect(result).toBe('obj[_rawProps.count] + _rawProps.count');
  });

  it('rewrites shorthand object properties with explicit keys', () => {
    const result = rewritePropsFieldReferences(
      '({ count })',
      new Map([['count', 'count']]),
      {
        memberPropertyMode: 'all',
      },
    );

    expect(result).toBe('({ count: _rawProps.count })');
  });
});
