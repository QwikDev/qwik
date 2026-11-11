import { expect, test } from 'vitest';
import { computeSymbolGraph } from './edges';
import { createSymbolPaths, getPathChildren } from './symbol-paths';

test('follows a shared successor from either branch and stops cycles within that path', () => {
  const graph = computeSymbolGraph(
    [
      [null, 'a'],
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
      ['d', 'e'],
      ['e', 'a'],
    ].map(([from, to]) => ({ from, to: to!, relatedCount: 1, unrelatedCount: 0 }))
  );
  const paths = createSymbolPaths(graph);
  const index = (name: string) => paths.findIndex((symbol) => symbol.name === name);
  for (const branch of ['b', 'c']) {
    const ancestors = [0, index('a'), index(branch)];
    expect(getPathChildren(paths, index('d'), ancestors)).toEqual([{ to: index('e'), count: 1 }]);
  }
  expect(
    getPathChildren(paths, index('a'), [0, index('a'), index('b'), index('d'), index('e')])
  ).toEqual([]);
  expect(JSON.parse(JSON.stringify(paths))).toHaveLength(graph.length);
});

test('serializes each node and transition once even with many overlapping paths', () => {
  const transitions: {
    from: string | null;
    to: string;
    relatedCount: number;
    unrelatedCount: number;
  }[] = [{ from: null, to: 'start', relatedCount: 1, unrelatedCount: 0 }];
  for (let i = 0; i < 24; i++) {
    const from = i === 0 ? 'start' : `join-${i - 1}`;
    for (const branch of ['left', 'right']) {
      transitions.push({ from, to: `${branch}-${i}`, relatedCount: 1, unrelatedCount: 0 });
      transitions.push({
        from: `${branch}-${i}`,
        to: `join-${i}`,
        relatedCount: 1,
        unrelatedCount: 0,
      });
    }
  }
  const paths = createSymbolPaths(computeSymbolGraph(transitions));
  expect(paths).toHaveLength(74);
  expect(paths.reduce((total, symbol) => total + symbol.children.length, 0)).toBe(
    transitions.length
  );
});
