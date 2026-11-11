import { expect, test } from 'vitest';
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
