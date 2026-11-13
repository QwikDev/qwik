import { describe, expect, it } from 'vitest';
import { toArrayIndex } from './array';

describe('toArrayIndex', () => {
  it('reads canonical index keys as numbers', () => {
    expect(toArrayIndex('0')).toBe(0);
    expect(toArrayIndex('12')).toBe(12);
    expect(toArrayIndex(3)).toBe(3);
  });

  it('rejects keys that do not name an array index', () => {
    const keys = ['-1', '1.5', '01', '', ' 1', 'NaN', 'Infinity', 'length', Symbol(), -1, 1.5];
    for (let i = 0; i < keys.length; i++) {
      expect(toArrayIndex(keys[i])).toBe(-1);
    }
  });
});
