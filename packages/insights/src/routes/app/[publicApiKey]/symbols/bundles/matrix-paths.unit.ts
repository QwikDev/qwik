import { expect, test } from 'vitest';
import { computeSymbolGraph, computeSymbolVectors } from '~/stats/edges';
import { readMatrixRows } from './matrix-paths';
import { createBundleViewData, getMatrixView } from './bundle-view';

test('reconstructs exact scores across branches and repeated paths', () => {
  const edges = [
    { from: null, to: 'a', relatedCount: 100, unrelatedCount: 0 },
    { from: 'a', to: 'b', relatedCount: 10, unrelatedCount: 90 },
    { from: 'a', to: 'c', relatedCount: 30, unrelatedCount: 70 },
    { from: 'b', to: 'c', relatedCount: 1, unrelatedCount: 99 },
    { from: 'c', to: 'a', relatedCount: 1, unrelatedCount: 99 },
  ];
  const result = computeSymbolVectors(computeSymbolGraph(edges), true);
  const indexes = result.symbols.map((_, index) => index);
  expect(readMatrixRows(result.paths!, indexes, indexes)).toEqual(result.vectors);
});

test('keeps a thousand-symbol chain compact while retaining exact weak scores', () => {
  const edges = Array.from({ length: 1000 }, (_, index) => ({
    from: index ? `s${index - 1}` : null,
    to: `s${index}`,
    relatedCount: 100,
    unrelatedCount: 100,
  }));
  const result = computeSymbolVectors(computeSymbolGraph(edges), true);
  const report = createBundleViewData(result, [{ name: 'chain', symbols: result.symbols }]);
  expect(report.matrix).toEqual([]);
  expect(report.matrixPaths!.length).toBeLessThanOrEqual(2001);
  expect(JSON.stringify(report).length).toBeLessThan(2_000_000);
  const last = result.symbols.length - 1;
  const view = getMatrixView(report, 0, true, last, last - 20);
  expect(view.matrix.flat().length).toBeLessThanOrEqual(10_000);
  expect(view.matrix[last].find((cell) => cell.column === last - 20)?.value).toBe(
    result.vectors[last][last - 20]
  );
  expect(readMatrixRows(report.matrixPaths!, [last], [last - 20])[0][0]).toBe(
    result.vectors[last][last - 20]
  );
});
