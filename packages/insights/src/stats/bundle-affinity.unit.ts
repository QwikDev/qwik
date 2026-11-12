import { expect, test } from 'vitest';
import { DBSCAN } from 'density-clustering';
import { computeBundles, type SymbolVectors } from './edges';
import { createAffinityTree, groupByAffinity } from './bundle-affinity';

const symbols = Array.from({ length: 4 }, (_, index) => ({
  name: `symbol-${index}`,
  count: 1,
  depth: 1,
  children: [],
  fullName: null,
  fileSrc: null,
}));
const vectors = [
  [1, 0, 0, 0],
  [0.9, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0.8, 1],
];
const input: SymbolVectors = { symbols, vectors };
const membership = (groups: { symbols: { name: string }[] }[]) =>
  groups
    .map((group) =>
      group.symbols
        .map((symbol) => symbol.name)
        .sort()
        .join(',')
    )
    .sort();

test('matches current clustering at the default affinity', () => {
  expect(membership(groupByAffinity(symbols, createAffinityTree(vectors), 50))).toEqual(
    membership(computeBundles(input))
  );
});

test('increasing affinity only splits groups and preserves every symbol', () => {
  const tree = createAffinityTree(vectors);
  let previousCount = 0;
  for (let affinity = 0; affinity <= 100; affinity++) {
    const groups = groupByAffinity(symbols, tree, affinity);
    expect(groups.length).toBeGreaterThanOrEqual(previousCount);
    expect(groups.flatMap((group) => group.symbols).length).toBe(symbols.length);
    previousCount = groups.length;
  }
  expect(groupByAffinity(symbols, tree, 0)).toHaveLength(1);
  expect(groupByAffinity(symbols, tree, 100)).toHaveLength(4);
});

test('handles empty data and identical vectors deterministically', () => {
  expect(groupByAffinity([], createAffinityTree([]), 50)).toEqual([]);
  const tree = createAffinityTree([[1], [1]]);
  expect(groupByAffinity(symbols.slice(0, 2), tree, 100)).toHaveLength(1);
  expect(groupByAffinity(symbols, createAffinityTree(vectors), 50)).toEqual(
    groupByAffinity(symbols, createAffinityTree(vectors), 50)
  );
});

test('preserves Euclidean clustering across sparse graphs and strict distance boundaries', () => {
  const threshold = 0.95 * Math.sqrt(2);
  const fixtures = [
    [
      [0, 0, 0],
      [threshold, 0, 0],
      [10, 10, 10],
    ],
    [
      [0, 0],
      [threshold, 0],
    ],
    [
      [0, 0],
      [threshold - 0.000001, 0],
    ],
    Array.from({ length: 24 }, (_, row) =>
      Array.from({ length: 24 }, (_, column) =>
        row === column ? 1 : (row + column) % 5 === 0 ? ((row * column) % 7) / 7 : 0
      )
    ),
  ];
  for (const vectors of fixtures) {
    const graphSymbols = vectors.map((_, index) => ({ ...symbols[0], name: `symbol-${index}` }));
    expect(membership(groupByAffinity(graphSymbols, createAffinityTree(vectors), 50))).toEqual(
      membership(computeBundles({ symbols: graphSymbols, vectors }))
    );
  }
});

test('bounds distance work for long execution chains', () => {
  const count = 100;
  let coordinateReads = 0;
  const chain = Array.from({ length: count }, (_, row) => {
    const vector = Array.from({ length: count }, (_, column) => (column <= row ? 1 : 0));
    Object.defineProperty(vector, 'flatMap', {
      value: (...args: Parameters<number[]['flatMap']>) => {
        const coordinates = Array.prototype.flatMap.apply(vector, args);
        return new Proxy(coordinates, {
          get(target, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) {
              coordinateReads++;
            }
            return Reflect.get(target, key, receiver);
          },
        });
      },
    });
    return vector;
  });

  const links = createAffinityTree(chain);
  expect(links).toHaveLength(count - 1);
  expect(links.every((link) => link.to === link.from + 1 && link.distance === 1)).toBe(true);
  expect(coordinateReads).toBeLessThan(count * count * 20);
});

test('preserves clustering across slider thresholds for binary and weighted vectors', () => {
  for (const isWeighted of [false, true]) {
    const matrix = Array.from({ length: 40 }, (_, row) =>
      Array.from({ length: 70 }, (_, column) => {
        if ((row + column) % 3 === 0) {
          return 0;
        }
        return isWeighted && row % 2 ? (column % 4) / 3 : 1;
      })
    );
    const graphSymbols = matrix.map((_, index) => ({ ...symbols[0], name: `symbol-${index}` }));
    const links = createAffinityTree(matrix);
    const defaultDistance = 0.95 * Math.sqrt(2);
    const maximum = Math.max(defaultDistance, ...links.map((link) => link.distance));
    for (let affinity = 1; affinity <= 100; affinity++) {
      const threshold =
        affinity === 50
          ? defaultDistance
          : affinity < 50
            ? maximum + ((defaultDistance - maximum) * affinity) / 50
            : (defaultDistance * (100 - affinity)) / 50;
      const expected = new DBSCAN()
        .run(matrix, threshold || Number.MIN_VALUE, 1)
        .map((cluster) => ({
          symbols: cluster.map((index) => graphSymbols[index]),
        }));
      expect(membership(groupByAffinity(graphSymbols, links, affinity))).toEqual(
        membership(expected)
      );
    }
  }
});

test('counts trailing binary dimensions when vector lengths differ', () => {
  for (const vectors of [
    [Array(32).fill(1), Array(64).fill(1)],
    [Array(64).fill(1), Array(32).fill(1)],
  ]) {
    expect(createAffinityTree(vectors)).toEqual([{ from: 0, to: 1, distance: Math.sqrt(32) }]);
  }
});
