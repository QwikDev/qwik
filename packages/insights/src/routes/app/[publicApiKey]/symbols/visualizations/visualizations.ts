import { createMatrixReader } from '../bundles/matrix-paths';
import type { BundleInfo, Relationship } from '../bundles/bundle-view';

export function getNeighborhood(data: BundleInfo, symbol: string, limit = 5) {
  const index = data.symbols.findIndex((candidate) => candidate.name === symbol);
  const incoming: Relationship[] = [];
  const outgoing: Relationship[] = [];
  if (index < 0) {
    return { incoming, outgoing };
  }
  visitMatrixScores(data, (row, column, score) => {
    if (row === index && column !== index) {
      incoming.push({ from: data.symbols[column].name, to: symbol, score });
    }
    if (column === index && row !== index) {
      outgoing.push({ from: symbol, to: data.symbols[row].name, score });
    }
  });
  const rank = (connections: Relationship[]) =>
    connections.sort((a, b) => b.score - a.score).slice(0, limit);
  return { incoming: rank(incoming), outgoing: rank(outgoing) };
}

export function getDefaultSymbol(data: BundleInfo) {
  const counts = data.symbols.map(() => 0);
  visitMatrixScores(data, (row, column, score) => {
    if (
      row !== column &&
      data.symbols[row].fullName &&
      data.symbols[column].fullName &&
      score >= 0.1
    ) {
      counts[row]++;
      counts[column]++;
    }
  });
  let selected = data.symbols.findIndex((symbol) => symbol.fullName);
  counts.forEach((count, index) => {
    if (data.symbols[index].fullName && count > (counts[selected] ?? -1)) {
      selected = index;
    }
  });
  return data.symbols[selected]?.name ?? data.symbols[0]?.name ?? '';
}

export function formatScore(score: number): string {
  return score > 0 && score < 0.01 ? score.toPrecision(2) : score.toFixed(2);
}

export function visitMatrixScores(
  data: BundleInfo,
  visit: (row: number, column: number, score: number) => void
) {
  if (!data.matrixPaths) {
    data.matrix.forEach((row, rowIndex) =>
      row.forEach((cell) => visit(rowIndex, cell.column, cell.value))
    );
    return;
  }
  const readRows = createMatrixReader(data.matrixPaths);
  const indexes = data.symbols.map((_, index) => index);
  for (const rowIndex of indexes) {
    const [row] = readRows([rowIndex], indexes);
    row.forEach((score, column) => {
      if (score > 0) {
        visit(rowIndex, column, score);
      }
    });
  }
}
