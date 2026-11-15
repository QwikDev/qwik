import { readMatrixRows } from './matrix-paths';
import type { Bundle, Symbol, SymbolVectors } from '~/stats/edges';

export interface MatrixCell {
  column: number;
  value: number;
}

export function getGroupMatrix<T extends { name: string }>(
  matrix: MatrixCell[][],
  symbols: T[],
  selectedNames: string[]
) {
  const selected = new Set(selectedNames);
  const indices = symbols.flatMap((symbol, index) => (selected.has(symbol.name) ? [index] : []));
  const columns = new Map(indices.map((original, index) => [original, index]));
  return {
    symbols: indices.map((index) => symbols[index]),
    matrix: indices.map((index) =>
      (matrix[index] ?? []).flatMap((cell) => {
        const column = columns.get(cell.column);
        return column === undefined ? [] : [{ column, value: cell.value }];
      })
    ),
  };
}

export function createBundleViewData(vectors: SymbolVectors, bundles: Bundle[]) {
  const summaries = new Map(
    vectors.symbols.map((symbol) => [symbol, { ...symbol, children: [] as Symbol['children'] }])
  );
  return {
    symbols: Array.from(summaries.values()),
    matrixPaths: vectors.paths,
    matrix: vectors.paths
      ? []
      : vectors.vectors.map((row) => {
          const cells: MatrixCell[] = [];
          row.forEach((value, column) => {
            if (value > 0) {
              cells.push({ column, value });
            }
          });
          return cells;
        }),
    bundles: bundles.map((bundle) => {
      const relationships = getStrongestRelationships(bundle.symbols, vectors);
      const symbolRelationships: Record<string, Relationship[]> = Object.fromEntries(
        bundle.symbols.map((symbol) => [symbol.name, []])
      );
      for (const relationship of relationships) {
        for (const name of [relationship.from, relationship.to]) {
          if (symbolRelationships[name].length < 5) {
            symbolRelationships[name].push(relationship);
          }
        }
      }
      return {
        ...bundle,
        symbols: bundle.symbols.map((symbol) => summaries.get(symbol)!),
        relationships: relationships.slice(0, 10),
        symbolRelationships,
      };
    }),
  };
}

export function getSelectedBundleIndex(selectedIndex: number, bundleCount: number): number {
  return selectedIndex >= 0 && selectedIndex < bundleCount ? selectedIndex : 0;
}

export function getBundleExecutionCount(bundle: {
  name: string;
  symbols: { count: number }[];
}): number {
  return bundle.symbols.reduce((total, symbol) => total + symbol.count, 0);
}

export function getMatrixCellColor(value: number): string {
  const strength = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `color-mix(in srgb, var(--color-editorial-data-current) ${strength}%, var(--color-editorial-canvas))`;
}

export interface Relationship {
  from: string;
  to: string;
  score: number;
}

interface RelationshipSymbol {
  name: string;
}

export function getStrongestRelationships(
  bundleSymbols: RelationshipSymbol[],
  symbolVectors: { symbols: RelationshipSymbol[]; vectors: number[][] }
) {
  const symbolIndex = new Map(symbolVectors.symbols.map((symbol, index) => [symbol.name, index]));
  const relationships: Relationship[] = [];

  for (let from = 0; from < bundleSymbols.length; from++) {
    for (let to = 0; to < bundleSymbols.length; to++) {
      if (from === to) {
        continue;
      }
      const fromIndex = symbolIndex.get(bundleSymbols[from].name);
      const toIndex = symbolIndex.get(bundleSymbols[to].name);
      if (fromIndex === undefined || toIndex === undefined) {
        continue;
      }
      const score = symbolVectors.vectors[toIndex]?.[fromIndex] ?? 0;
      if (score > 0) {
        relationships.push({
          from: bundleSymbols[from].name,
          to: bundleSymbols[to].name,
          score,
        });
      }
    }
  }

  return relationships.sort((a, b) => b.score - a.score);
}

export type BundleInfo = ReturnType<typeof createBundleViewData>;

export function getMatrixView(
  data: BundleInfo,
  selectedIndex: number,
  showAll: boolean,
  selectedRow = 0,
  selectedColumn = 0
) {
  const bundles = showAll
    ? data.bundles.map((bundle, index) => ({ bundle, index }))
    : data.bundles.at(selectedIndex)
      ? [{ bundle: data.bundles[selectedIndex], index: selectedIndex }]
      : [];
  const symbols = bundles.flatMap(({ bundle }) => bundle.symbols);
  const originalIndexes = new Map(data.symbols.map((symbol, index) => [symbol.name, index]));
  const columns = new Map(
    symbols.map((symbol, index) => [originalIndexes.get(symbol.name), index])
  );
  let start = 0;
  const groups = bundles.map(({ bundle, index }) => {
    const group = { label: `Group ${index + 1}`, start, size: bundle.symbols.length };
    start += group.size;
    return group;
  });
  const rowStart = Math.floor(Math.max(0, Math.min(symbols.length - 1, selectedRow)) / 100) * 100;
  const columnStart =
    Math.floor(Math.max(0, Math.min(symbols.length - 1, selectedColumn)) / 100) * 100;
  const rowEnd = Math.min(symbols.length, rowStart + 100);
  const columnEnd = Math.min(symbols.length, columnStart + 100);
  const selectedRows = symbols
    .slice(rowStart, rowEnd)
    .map((symbol) => originalIndexes.get(symbol.name)!);
  const selectedColumns = symbols
    .slice(columnStart, columnEnd)
    .map((symbol) => originalIndexes.get(symbol.name)!);
  const decoded = data.matrixPaths
    ? readMatrixRows(data.matrixPaths, selectedRows, selectedColumns)
    : undefined;
  const matrix = symbols.map((symbol, rowIndex) => {
    if (rowIndex < rowStart || rowIndex >= rowEnd) {
      return [];
    }
    if (decoded) {
      return decoded[rowIndex - rowStart].flatMap((value, offset) =>
        value > 0 ? [{ column: columnStart + offset, value }] : []
      );
    }
    const row = data.matrix[originalIndexes.get(symbol.name)!] ?? [];
    return row.flatMap((cell) => {
      const column = columns.get(cell.column);
      return column === undefined || column < columnStart || column >= columnEnd
        ? []
        : [{ column, value: cell.value }];
    });
  });
  return { symbols, matrix, groups, rowStart, columnStart, rowEnd, columnEnd };
}
