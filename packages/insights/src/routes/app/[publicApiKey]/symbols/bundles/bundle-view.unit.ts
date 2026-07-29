import { describe, expect, it } from 'vitest';
import { getBundleExecutionCount, getMatrixCellColor } from './bundle-view';

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
});
