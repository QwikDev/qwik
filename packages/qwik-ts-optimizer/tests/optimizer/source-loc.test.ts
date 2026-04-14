import { describe, expect, it } from 'vitest';
import { computeLineColFromOffset } from '../../src/optimizer/utils/source-loc.js';

describe('source-loc', () => {
  it('computes 1-based line and column positions', () => {
    expect(computeLineColFromOffset('alpha\nbeta\ngamma', 0)).toEqual([1, 1]);
    expect(computeLineColFromOffset('alpha\nbeta\ngamma', 6)).toEqual([2, 1]);
    expect(computeLineColFromOffset('alpha\nbeta\ngamma', 9)).toEqual([2, 4]);
  });
});
