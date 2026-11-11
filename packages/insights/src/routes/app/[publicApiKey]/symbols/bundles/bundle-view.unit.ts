import { describe, expect, it } from 'vitest';
import {
  getBundleExecutionCount,
  getMatrixView,
  createBundleViewData,
  getMatrixCellColor,
  getStrongestRelationships,
} from './bundle-view';
import type { Symbol } from '~/stats/edges';

describe('bundle view', () => {
  it('preserves every positive score so filtering cannot be confused with zero', () => {
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
        { column: 1, value: 0.04 },
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
        [0.04, 1],
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
      { from: 'symbol-1', to: 'symbol-0', score: 0.5 },
      { from: 'symbol-0', to: 'symbol-1', score: 0.04 },
    ]);
    expect(result.matrix[0]).toEqual([
      { column: 0, value: 1 },
      { column: 1, value: 0.5 },
    ]);
    expect(vectors.vectors).toEqual([
      [1, 0.5],
      [0.04, 1],
    ]);
    expect(symbols[0].children).toHaveLength(1);
    const resumed = await _deserialize<typeof result>(await _serialize(result));
    expect(resumed).toEqual(result);
    expect(resumed.bundles[0].symbols[0]).toBe(resumed.symbols[0]);
  });

  it('preserves the strongest connections for every symbol, beyond the group top ten', () => {
    const symbols = Array.from({ length: 8 }, (_, index) => ({
      name: `symbol-${index}`,
      count: 1,
      depth: 0,
      fullName: null,
      fileSrc: null,
      children: [],
    }));
    const vectors = symbols.map((_, row) =>
      symbols.map((_, column) => (row === column ? 1 : (row + column + 1) / 20))
    );
    const result = createBundleViewData({ symbols, vectors }, [{ name: 'bundle', symbols }]);
    expect(result.bundles[0].relationships).toHaveLength(10);
    const connections = result.bundles[0].symbolRelationships['symbol-0'];
    expect(connections).toHaveLength(5);
    expect(connections.every(({ from, to }) => from === 'symbol-0' || to === 'symbol-0')).toBe(
      true
    );
    expect(connections[0].score).toBe(0.4);
    expect(connections.every(({ from, to }) => from !== to)).toBe(true);
  });

  it('orders both matrix axes by group and remaps directional scores without changing input', () => {
    const symbols: Symbol[] = ['a', 'b', 'c'].map((name) => ({
      name,
      count: 1,
      fullName: null,
      fileSrc: null,
      depth: 0,
      children: [],
    }));
    const data = createBundleViewData(
      {
        symbols,
        vectors: [
          [1, 0.2, 0],
          [0.7, 1, 0.1],
          [0, 0, 1],
        ],
      },
      [
        { name: 'bc', symbols: [symbols[2], symbols[1]] },
        { name: 'a', symbols: [symbols[0]] },
      ]
    );
    const original = JSON.stringify(data);
    const selected = getMatrixView(data, 0, false);
    expect(selected.symbols.map(({ name }) => name)).toEqual(['c', 'b']);
    expect(selected.matrix).toEqual([
      [{ column: 0, value: 1 }],
      [
        { column: 1, value: 1 },
        { column: 0, value: 0.1 },
      ],
    ]);
    const all = getMatrixView(data, 0, true);
    expect(all.symbols.map(({ name }) => name)).toEqual(['c', 'b', 'a']);
    expect(all.matrix[1]).toContainEqual({ column: 2, value: 0.7 });
    expect(all.groups).toEqual([
      { label: 'Group 1', start: 0, size: 2 },
      { label: 'Group 2', start: 2, size: 1 },
    ]);
    expect(JSON.stringify(data)).toBe(original);
    expect(
      getMatrixView(createBundleViewData({ symbols: [], vectors: [] }, []), 0, false).symbols
    ).toEqual([]);
  });

  it('summarizes recorded executions', () => {
    expect(
      getBundleExecutionCount({
        name: 'bundle_a',
        symbols: [{ count: 7 }, { count: 36 }, { count: 76 }],
      })
    ).toBe(119);
  });

  it('fades weak scores into the canvas without a minimum color floor', () => {
    expect(getMatrixCellColor(0)).toBe(
      'color-mix(in srgb, var(--color-editorial-data-current) 0%, var(--color-editorial-canvas))'
    );
    expect(getMatrixCellColor(0.01)).toBe(
      'color-mix(in srgb, var(--color-editorial-data-current) 1%, var(--color-editorial-canvas))'
    );
    expect(getMatrixCellColor(0.5)).toBe(
      'color-mix(in srgb, var(--color-editorial-data-current) 50%, var(--color-editorial-canvas))'
    );
    expect(getMatrixCellColor(-1)).toBe(getMatrixCellColor(0));
    expect(getMatrixCellColor(2)).toBe(getMatrixCellColor(1));
    expect(getMatrixCellColor(1)).toBe(
      'color-mix(in srgb, var(--color-editorial-data-current) 100%, var(--color-editorial-canvas))'
    );
  });

  it('ranks both directions from preceding to later symbols within the selected bundle', () => {
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
      { from: 'third', to: 'first', score: 0.9 },
      { from: 'second', to: 'third', score: 0.8 },
      { from: 'first', to: 'second', score: 0.6 },
      { from: 'third', to: 'second', score: 0.4 },
      { from: 'second', to: 'first', score: 0.2 },
      { from: 'first', to: 'third', score: 0.1 },
    ]);
  });
});
