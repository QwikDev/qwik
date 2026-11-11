import type { BundleInfo, Relationship } from '../bundles/bundle-view';

export function getNeighborhood(data: BundleInfo, symbol: string, limit = 5) {
  const index = data.symbols.findIndex((candidate) => candidate.name === symbol);
  const incoming: Relationship[] = [];
  const outgoing: Relationship[] = [];
  if (index < 0) {
    return { incoming, outgoing };
  }
  for (const cell of data.matrix[index] ?? []) {
    if (cell.column !== index) {
      incoming.push({ from: data.symbols[cell.column].name, to: symbol, score: cell.value });
    }
  }
  data.matrix.forEach((row, rowIndex) => {
    if (rowIndex === index) {
      return;
    }
    const cell = row.find((cell) => cell.column === index);
    if (cell) {
      outgoing.push({ from: symbol, to: data.symbols[rowIndex].name, score: cell.value });
    }
  });
  const rank = (connections: Relationship[]) =>
    connections.sort((a, b) => b.score - a.score).slice(0, limit);
  return { incoming: rank(incoming), outgoing: rank(outgoing) };
}

export function getDefaultSymbol(data: BundleInfo) {
  const counts = data.symbols.map(() => 0);
  data.matrix.forEach((row, rowIndex) => {
    if (!data.symbols[rowIndex].fullName) {
      return;
    }
    for (const cell of row) {
      if (cell.column !== rowIndex && data.symbols[cell.column].fullName && cell.value >= 0.1) {
        counts[rowIndex]++;
        counts[cell.column]++;
      }
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
