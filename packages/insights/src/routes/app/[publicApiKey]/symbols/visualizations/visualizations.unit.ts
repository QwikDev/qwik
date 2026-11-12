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
import type { SymbolPairCounts } from '~/stats/edges';
import { createBundleViewData } from '../bundles/bundle-view';
import {
  formatScore,
  formatDensity,
  getNeighborhood,
  getDefaultSymbol,
  getGroupDensity,
  findObservedPath,
  getExamplePath,
  getObservedEdges,
} from './visualizations';

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
  it('counts directed connections above the threshold and excludes self pairs', () => {
    const density = getGroupDensity(data, 0.5);
    expect(density.cells[0][0]).toMatchObject({ count: 1, possible: 2, density: 0.5 });
    expect(density.cells[1][0]).toMatchObject({ count: 1, possible: 2, density: 0.5 });
    expect(density.cells[0][1]).toMatchObject({ count: 0, possible: 2, density: 0 });
    expect(density.cells[1][1]).toMatchObject({ count: 0, possible: 0, density: 0 });
  });
  it('combines overflow groups without losing symbols or inventing connections', () => {
    const density = getGroupDensity(data, 0.5, 1);
    expect(density.groups.map((group) => group.symbols.length)).toEqual([2, 1]);
    expect(density.groups[1].label).toBe('Other 1 group');
  });
  it('finds a bounded shortest observed path without following cycles', () => {
    const edges = [
      { from: 'a', to: 'b', count: 5 },
      { from: 'b', to: 'a', count: 3 },
      { from: 'b', to: 'c', count: 2 },
    ];
    expect(findObservedPath(edges, 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect(findObservedPath(edges, 'c', 'a')).toEqual([]);
    expect(findObservedPath(edges, 'a', 'c', 1)).toEqual([]);
  });
  it('chooses a multi-step example when a shortcut would collapse the first candidate', () => {
    const edges = [
      { from: 'a', to: 'b', count: 10 },
      { from: 'b', to: 'c', count: 8 },
      { from: 'a', to: 'c', count: 6 },
      { from: 'd', to: 'e', count: 5 },
      { from: 'e', to: 'f', count: 4 },
    ];
    expect(getExamplePath(edges, new Set(['a', 'b', 'c', 'd', 'e', 'f']))).toEqual(['d', 'e', 'f']);
    expect(findObservedPath([], '', '')).toEqual([]);
  });
  it('bounds example search on dense graphs with direct shortcuts', () => {
    const names = Array.from({ length: 71 }, (_, index) => String(index));
    let visits = 0;
    const edges = names.flatMap((from) =>
      names
        .filter((to) => to !== from)
        .map((to) => ({
          from,
          to,
          get count() {
            visits++;
            return 1;
          },
        }))
    );
    expect(getExamplePath(edges, new Set(names))).toHaveLength(2);
    expect(visits).toBeLessThan(edges.length * 100);
  });
  it('serializes flat observed edges without graph cycles, self pairs, or outside symbols', async () => {
    (globalThis as any).__EXPERIMENTAL__ = {};
    const { _serialize } = await import('@qwik.dev/core/internal/serializer');
    const { _deserialize } = await import('@qwik.dev/core/internal');
    const rows: SymbolPairCounts[] = [
      { from: 'a', to: 'b', relatedCount: 5, unrelatedCount: 7 },
      { from: 'b', to: 'a', relatedCount: 0, unrelatedCount: 3 },
      { from: 'a', to: 'a', relatedCount: 1, unrelatedCount: 0 },
      { from: 'a', to: 'outside', relatedCount: 9, unrelatedCount: 0 },
      { from: null, to: 'a', relatedCount: 2, unrelatedCount: 0 },
      { from: 'a', to: 'b', relatedCount: 0, unrelatedCount: 0 },
    ];
    const edges = getObservedEdges(rows, new Set(['a', 'b']));
    expect(edges).toEqual([
      { from: 'a', to: 'b', count: 12 },
      { from: 'b', to: 'a', count: 3 },
    ]);
    expect(await _deserialize(await _serialize(edges))).toEqual(edges);
    expect(rows).toHaveLength(6);
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
  expect(getGroupDensity(compact, 0.001)).toEqual(getGroupDensity(dense, 0.001));
  for (const symbol of vectors.symbols) {
    matrixQueries.length = 0;
    expect(getNeighborhood(compact, symbol.name)).toEqual(getNeighborhood(dense, symbol.name));
    expect(matrixQueries.every(([rows, columns]) => rows === 1 || columns === 1)).toBe(true);
    expect(
      matrixQueries.reduce((total, [rows, columns]) => total + rows * columns, 0)
    ).toBeLessThanOrEqual(2 * vectors.symbols.length);
  }
});

it('keeps small positive densities distinct from zero', () => {
  expect(formatDensity(1 / 250000, 1)).toBe('<0.1%');
  expect(formatDensity(1 / 250000)).toBe('<0.01%');
  expect(formatDensity(0)).toBe('0.00%');
});
it('sums observed counts for normalized pairs', () => {
  const names = new Set(['a', 'b']);
  expect(
    getObservedEdges(
      [
        { from: 'a', to: 'b', relatedCount: 3, unrelatedCount: 2 },
        { from: 'a', to: 'b', relatedCount: 5, unrelatedCount: 4 },
      ],
      names
    )
  ).toEqual([{ from: 'a', to: 'b', count: 14 }]);
});

it('counts dense groups without sorting an unbounded relationship list', () => {
  const symbols = Array.from({ length: 64 }, (_, index) => ({
    ...data.symbols[0],
    name: `s${index}`,
  }));
  const report = createBundleViewData(
    { symbols, vectors: symbols.map(() => symbols.map(() => 1)) },
    [{ name: 'all', symbols }]
  );
  let largest = 0;
  const original = Array.prototype.sort;
  const spy = vi.spyOn(Array.prototype, 'sort').mockImplementation(function (
    this: unknown[],
    compare
  ) {
    largest = Math.max(largest, this.length);
    return original.call(this, compare);
  });
  try {
    const density = getGroupDensity(report, 0.5);
    expect(density.cells[0][0].count).toBe(64 * 63);
    expect(density.cells[0][0].strongest).toHaveLength(3);
    expect(largest).toBeLessThanOrEqual(4);
  } finally {
    spy.mockRestore();
  }
});
