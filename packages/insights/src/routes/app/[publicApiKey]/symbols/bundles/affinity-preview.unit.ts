import { createAffinityTree, groupByAffinity } from '~/stats/bundle-affinity';
import { expect, test } from 'vitest';
import { computeSymbolGraph, computeSymbolVectors } from '~/stats/edges';
import { createBundleViewData } from './bundle-view';
import { createPreviewBundles, getPreviewBundles } from './affinity-preview';

test('keeps unfiltered relationships for every symbol in a unit-weight chain', () => {
  const vectors = computeSymbolVectors(
    computeSymbolGraph(
      Array.from({ length: 21 }, (_, index) => ({
        from: index ? `s${index - 1}` : null,
        to: `s${index}`,
        relatedCount: 100,
        unrelatedCount: 0,
      }))
    ),
    true
  );
  const groups = [{ name: 'chain', symbols: vectors.symbols }];
  const automatic = createBundleViewData(vectors, groups);
  expect(automatic.matrix).toEqual([]);
  const preview = createPreviewBundles(groups, { ...automatic, previewPaths: vectors.paths });
  expect(preview[0].relationships).toEqual(automatic.bundles[0].relationships);
  expect(preview[0].symbolRelationships.s0).toEqual([]);
  for (const symbol of vectors.symbols) {
    const inspected = createPreviewBundles(
      groups,
      { ...automatic, previewPaths: vectors.paths },
      symbol.name
    );
    expect(inspected[0].symbolRelationships[symbol.name]).toEqual(
      automatic.bundles[0].symbolRelationships[symbol.name]
    );
  }
});

test('visits each matrix row once across many groups and caps endpoint lists', () => {
  const symbols = Array.from({ length: 100 }, (_, index) => ({
    name: `s${index}`,
    count: 1,
    depth: 0,
    fullName: null,
    fileSrc: null,
    children: [],
  }));
  const report = createBundleViewData({ symbols, vectors: [] }, []);
  let reads = 0;
  report.matrix = symbols.map((_, index) => {
    const row = [{ column: (index + 1) % 100, value: 1 }];
    Object.defineProperty(row[0], 'value', {
      get: () => {
        reads++;
        return 1;
      },
    });
    return row;
  });
  const groups = symbols.map((symbol) => ({ name: symbol.name, symbols: [symbol] }));
  const preview = createPreviewBundles(groups, report);
  expect(preview).toHaveLength(100);
  expect(reads).toBeLessThanOrEqual(100);
  expect(preview.every((bundle) => bundle.relationships.length === 0)).toBe(true);
});

test('reuses relationship lists when successive affinities keep the same partition', () => {
  const symbols = Array.from({ length: 3 }, (_, i) => ({
    name: `s${i}`,
    count: 1,
    depth: 0,
    fullName: null,
    fileSrc: null,
    children: [],
  }));
  const report = createBundleViewData(
    {
      symbols,
      vectors: [
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
      ],
    },
    [{ name: 'chain', symbols }]
  );
  const tree = createAffinityTree([
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ]);
  const first = getPreviewBundles(groupByAffinity(symbols, tree, 50), report);
  expect(first).toBe(report.bundles);
  for (const affinity of [49, 48]) {
    const next = getPreviewBundles(groupByAffinity(symbols, tree, affinity), report);
    expect(next).toBe(first);
    expect(next[0].relationships).toBe(first[0].relationships);
  }
  const split = getPreviewBundles(
    symbols.map((symbol) => ({ name: symbol.name, symbols: [symbol] })),
    report
  );
  expect(split).not.toBe(first);
  expect(split).toHaveLength(3);
  expect(split.every((group) => group.relationships.length === 0)).toBe(true);
});
