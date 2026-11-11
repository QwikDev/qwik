import { describe, expect, it } from 'vitest';
import {
  getBundleExecutionCount,
  createBundleViewData,
  getMatrixCellColor,
  getStrongestRelationships,
} from './bundle-view';
import type { Symbol } from '~/stats/edges';

describe('bundle view', () => {
  it('sends only matrix cells that are visible in the report', () => {
    const vectors = {
      symbols: [],
      vectors: [
        [1, 0.04, 0.1],
        [0, 0, 0],
        [0, 0, 1],
      ],
    };
    expect(createBundleViewData(vectors, []).matrix).toEqual([
      [
        { column: 0, value: 1 },
        { column: 2, value: 0.1 },
      ],
      [],
      [{ column: 2, value: 1 }],
    ]);
  });

  it('sends flat symbol summaries while preserving bundle and matrix relationships', async () => {
    (globalThis as any).__EXPERIMENTAL__ = {};
    const { _serialize } = await import('@qwik.dev/core/internal/serializer');
    const { _deserialize } = await import('@qwik.dev/core/internal');
    const symbols: Symbol[] = Array.from({ length: 1500 }, (_, index) => ({
      name: `symbol-${index}`,
      count: index + 1,
      depth: index,
      fullName: `full-${index}`,
      fileSrc: `source-${index}.tsx`,
      children: [],
    }));
    symbols.forEach((symbol, index) => {
      symbol.children.push({ from: symbol, to: symbols[(index + 1) % symbols.length], count: 1 });
    });
    const vectors = {
      symbols,
      vectors: [
        [1, 0.5],
        [0.2, 1],
      ],
    };
    const bundles = [{ name: 'bundle_a', symbols: symbols.slice(0, 2) }];
    const result = createBundleViewData(vectors, bundles);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result.symbols).toHaveLength(1500);
    expect(result.symbols.every((symbol) => symbol.children.length === 0)).toBe(true);
    expect(result.symbols[0]).toEqual({ ...symbols[0], children: [] });
    expect(result.bundles[0].symbols[0]).toBe(result.symbols[0]);
    expect(getBundleExecutionCount(result.bundles[0])).toBe(3);
    expect(result.bundles[0].relationships).toEqual([
      { from: 'symbol-0', to: 'symbol-1', score: 0.5 },
    ]);
    expect(result.matrix[0]).toEqual([
      { column: 0, value: 1 },
      { column: 1, value: 0.5 },
    ]);
    expect(vectors.vectors).toEqual([
      [1, 0.5],
      [0.2, 1],
    ]);
    expect(symbols[0].children).toHaveLength(1);
    const resumed = await _deserialize<typeof result>(await _serialize(result));
    expect(resumed).toEqual(result);
    expect(resumed.bundles[0].symbols[0]).toBe(resumed.symbols[0]);
  });

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
