import { expect, test } from 'vitest';
import { computeSymbolGraph, computeSymbolVectors } from '~/stats/edges';
import { createBundleViewData } from './bundle-view';
import { createPreviewBundles } from './affinity-preview';

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
  expect(automatic.matrix[20]).toEqual([]);
  const preview = createPreviewBundles(groups, { ...automatic, previewPaths: vectors.paths });
  expect(preview[0].relationships).toEqual(automatic.bundles[0].relationships);
  expect(preview[0].symbolRelationships).toEqual(automatic.bundles[0].symbolRelationships);
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
