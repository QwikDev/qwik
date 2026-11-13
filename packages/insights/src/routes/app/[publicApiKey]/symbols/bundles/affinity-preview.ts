import type { MatrixPath } from '~/stats/edges';
import type { BundleInfo, Relationship } from './bundle-view';
import { createMatrixReader } from './matrix-paths';

export function createPreviewBundles(
  groups: { name: string; symbols: BundleInfo['symbols'] }[],
  report: BundleInfo & { previewPaths?: MatrixPath[] },
  inspectedSymbol?: string
) {
  const symbolIndexes = new Map(report.symbols.map((symbol, index) => [symbol.name, index]));
  const groupIndexes = new Map(
    groups.flatMap((group, index) => group.symbols.map((symbol) => [symbol.name, index] as const))
  );
  const bundles = groups.map((group) => ({
    ...group,
    relationships: [] as Relationship[],
    symbolRelationships: Object.fromEntries(
      group.symbols.map((symbol) => [symbol.name, [] as Relationship[]])
    ),
  }));
  const compare = (left: Relationship, right: Relationship) =>
    right.score - left.score ||
    symbolIndexes.get(left.from)! - symbolIndexes.get(right.from)! ||
    symbolIndexes.get(left.to)! - symbolIndexes.get(right.to)!;
  const retain = (list: Relationship[], relationship: Relationship, limit: number) => {
    if (list.length === limit && compare(relationship, list[list.length - 1]) >= 0) {
      return;
    }
    list.push(relationship);
    list.sort(compare);
    if (list.length > limit) {
      list.pop();
    }
  };
  const append = (laterIndex: number, precedingIndex: number, score: number) => {
    const to = report.symbols[laterIndex].name;
    const from = report.symbols[precedingIndex].name;
    const groupIndex = groupIndexes.get(to);
    if (
      from === to ||
      score <= 0 ||
      groupIndex === undefined ||
      groupIndex !== groupIndexes.get(from)
    ) {
      return;
    }
    const bundle = bundles[groupIndex];
    const relationship = { from, to, score };
    if (!inspectedSymbol) {
      retain(bundle.relationships, relationship, 10);
    } else if (from === inspectedSymbol || to === inspectedSymbol) {
      retain(bundle.symbolRelationships[inspectedSymbol], relationship, 5);
    }
  };
  if (!report.previewPaths) {
    report.matrix.forEach((row, laterIndex) =>
      row.forEach((cell) => append(laterIndex, cell.column, cell.value))
    );
    return bundles;
  }
  const readRows = createMatrixReader(report.previewPaths);
  const columnsByGroup = groups.map((group) =>
    group.symbols.map((symbol) => symbolIndexes.get(symbol.name)!)
  );
  report.symbols.forEach((symbol, laterIndex) => {
    const groupIndex = groupIndexes.get(symbol.name);
    if (groupIndex === undefined || groups[groupIndex].symbols.length < 2) {
      return;
    }
    const columns = columnsByGroup[groupIndex];
    const [row] = readRows([laterIndex], columns);
    row.forEach((score, index) => append(laterIndex, columns[index], score));
  });
  return bundles;
}

const previewCache = new WeakMap<
  BundleInfo,
  { partition: string; bundles: BundleInfo['bundles'] }
>();

export function getPreviewBundles(
  groups: Parameters<typeof createPreviewBundles>[0],
  report: Parameters<typeof createPreviewBundles>[1]
) {
  const partition = JSON.stringify(
    groups.map((group) => group.symbols.map((symbol) => symbol.name))
  );
  const previous = previewCache.get(report);
  if (previous?.partition === partition) {
    return previous.bundles;
  }
  const originalPartition = JSON.stringify(
    report.bundles.map((group) => group.symbols.map((symbol) => symbol.name))
  );
  const bundles =
    originalPartition === partition ? report.bundles : createPreviewBundles(groups, report);
  previewCache.set(report, { partition, bundles });
  return bundles;
}
