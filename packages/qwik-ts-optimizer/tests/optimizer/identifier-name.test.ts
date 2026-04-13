import { describe, expect, it } from 'vitest';
import {
  buildPropertyAccessor,
  isSimpleIdentifierName,
} from '../../src/optimizer/utils/identifier-name.js';

describe('identifier-name', () => {
  it('detects plain identifier property names', () => {
    expect(isSimpleIdentifierName('count')).toBe(true);
    expect(isSimpleIdentifierName('_count2')).toBe(true);
    expect(isSimpleIdentifierName('$value')).toBe(true);

    expect(isSimpleIdentifierName('bind:value')).toBe(false);
    expect(isSimpleIdentifierName('kebab-case')).toBe(false);
    expect(isSimpleIdentifierName('1count')).toBe(false);
  });

  it('builds dot or bracket accessors as needed', () => {
    expect(buildPropertyAccessor('_rawProps', 'count')).toBe('_rawProps.count');
    expect(buildPropertyAccessor('_rawProps', 'bind:value')).toBe(
      '_rawProps["bind:value"]',
    );
  });
});
