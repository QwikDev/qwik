import { describe, expect, it } from 'vitest';
import {
  getBundleExecutionCount,
  getMatrixCellColor,
  getStrongestRelationships,
} from './bundle-view';

describe('bundle view', () => {
  it('summarizes recorded executions', () => {
    expect(
      getBundleExecutionCount({
        name: 'bundle_a',
        symbols: [{ count: 7 }, { count: 36 }, { count: 76 }],
      })
    ).toBe(119);
  });

  it('uses the editorial data palette for matrix values', () => {
    expect(getMatrixCellColor(0)).toBe(
      'color-mix(in srgb, var(--color-editorial-data-current) 0%, var(--color-editorial-data-band))'
    );
    expect(getMatrixCellColor(1)).toBe(
      'color-mix(in srgb, var(--color-editorial-data-current) 100%, var(--color-editorial-data-band))'
    );
  });

  it('ranks relationships within the selected bundle', () => {
    const [first, second, third, outside] = ['first', 'second', 'third', 'outside'].map((name) => ({
      name,
    }));

    expect(
      getStrongestRelationships([first, second, third], {
        symbols: [first, second, third, outside],
        vectors: [
          [1, 0.2, 0.9, 0.99],
          [0.6, 1, 0.4, 0.99],
          [0.1, 0.8, 1, 0.99],
          [0.99, 0.99, 0.99, 1],
        ],
      })
    ).toEqual([
      { from: 'first', to: 'third', score: 0.9 },
      { from: 'second', to: 'third', score: 0.8 },
      { from: 'first', to: 'second', score: 0.6 },
    ]);
  });
});
