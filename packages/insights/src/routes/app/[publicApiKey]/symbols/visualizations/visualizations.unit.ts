const { matrixQueries } = vi.hoisted(() => ({ matrixQueries: [] as [number, number][] }));
vi.mock('../bundles/matrix-paths', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../bundles/matrix-paths')>();
  return {
    ...actual,
    createMatrixReader: (paths: Parameters<typeof actual.createMatrixReader>[0]) => {
      const read = actual.createMatrixReader(paths);
      return (rows: number[], columns: number[]) => {
        matrixQueries.push([rows.length, columns.length]);
        return read(rows, columns);
      };
    },
  };
});
import { computeSymbolGraph, computeSymbolVectors } from '~/stats/edges';
import { describe, expect, it, vi } from 'vitest';
import { createBundleViewData } from '../bundles/bundle-view';
import { formatScore, getNeighborhood, getDefaultSymbol } from './visualizations';

const symbols = ['a', 'b', 'c'].map((name) => ({
  name,
  count: 10,
  depth: 0,
  children: [],
  fullName: name,
  fileSrc: null,
}));
const data = createBundleViewData(
  {
    symbols,
    vectors: [
      [1, 0.2, 0],
      [0.8, 1, 0],
      [0.6, 0, 1],
    ],
  },
  [
    { name: 'ab', symbols: symbols.slice(0, 2) },
    { name: 'c', symbols: symbols.slice(2) },
  ]
);

describe('relationship visualization alternatives', () => {
  it('selects a named symbol in one matrix pass and ignores self and weak connections', () => {
    let visits = 0;
    const matrix = data.matrix.map((row) =>
      row.map((cell) => ({
        column: cell.column,
        get value() {
          visits++;
          return cell.value;
        },
      }))
    );
    expect(getDefaultSymbol({ ...data, matrix })).toBe('a');
    expect(visits).toBeLessThanOrEqual(matrix.flat().length);
    expect(getDefaultSymbol({ ...data, symbols: [], matrix: [] })).toBe('');
  });
  it('separates incoming and outgoing modeled scores and limits each side', () => {
    expect(getNeighborhood(data, 'a', 1)).toEqual({
      incoming: [{ from: 'b', to: 'a', score: 0.2 }],
      outgoing: [{ from: 'a', to: 'b', score: 0.8 }],
    });
    expect(getNeighborhood(data, 'missing', 5)).toEqual({ incoming: [], outgoing: [] });
  });
});

it('shows weak positive scores distinctly from zero', () => {
  expect(formatScore(0.004)).toBe('0.0040');
  expect(formatScore(0)).toBe('0.00');
  expect(formatScore(0.8)).toBe('0.80');
});

it('reads the same neighborhood from compact paths as from exact matrix scores', () => {
  const vectors = computeSymbolVectors(
    computeSymbolGraph([
      { from: null, to: 'first', relatedCount: 100, unrelatedCount: 0 },
      { from: 'first', to: 'second', relatedCount: 1, unrelatedCount: 99 },
      { from: 'second', to: 'third', relatedCount: 1, unrelatedCount: 99 },
    ]),
    true
  );
  const groups = [{ name: 'all', symbols: vectors.symbols }];
  const compact = createBundleViewData(vectors, groups);
  const dense = createBundleViewData(
    { symbols: vectors.symbols, vectors: vectors.vectors },
    groups
  );
  expect(compact.matrix).toEqual([]);
  for (const symbol of vectors.symbols) {
    matrixQueries.length = 0;
    expect(getNeighborhood(compact, symbol.name)).toEqual(getNeighborhood(dense, symbol.name));
    expect(matrixQueries.every(([rows, columns]) => rows === 1 || columns === 1)).toBe(true);
    expect(
      matrixQueries.reduce((total, [rows, columns]) => total + rows * columns, 0)
    ).toBeLessThanOrEqual(2 * vectors.symbols.length);
  }
});
