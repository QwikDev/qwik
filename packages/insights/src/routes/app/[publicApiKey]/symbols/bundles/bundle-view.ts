export function getBundleExecutionCount(bundle: {
  name: string;
  symbols: { count: number }[];
}): number {
  return bundle.symbols.reduce((total, symbol) => total + symbol.count, 0);
}

export function getMatrixCellColor(value: number): string {
  const strength = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `color-mix(in srgb, var(--color-editorial-data-current) ${strength}%, var(--color-editorial-data-band))`;
}

interface RelationshipSymbol {
  name: string;
}

export function getStrongestRelationships(
  bundleSymbols: RelationshipSymbol[],
  symbolVectors: { symbols: RelationshipSymbol[]; vectors: number[][] }
) {
  const symbolIndex = new Map(symbolVectors.symbols.map((symbol, index) => [symbol.name, index]));
  const relationships: { from: string; to: string; score: number }[] = [];

  for (let from = 0; from < bundleSymbols.length; from++) {
    for (let to = from + 1; to < bundleSymbols.length; to++) {
      const fromIndex = symbolIndex.get(bundleSymbols[from].name);
      const toIndex = symbolIndex.get(bundleSymbols[to].name);
      if (fromIndex === undefined || toIndex === undefined) {
        continue;
      }
      const score = Math.max(
        symbolVectors.vectors[fromIndex]?.[toIndex] ?? 0,
        symbolVectors.vectors[toIndex]?.[fromIndex] ?? 0
      );
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
