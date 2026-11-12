import { createMatrixReader } from '../bundles/matrix-paths';
import type { SymbolPairCounts } from '~/stats/edges';
import type { BundleInfo, Relationship } from '../bundles/bundle-view';

export function getNeighborhood(data: BundleInfo, symbol: string, limit = 5) {
  const index = data.symbols.findIndex((candidate) => candidate.name === symbol);
  const incoming: Relationship[] = [];
  const outgoing: Relationship[] = [];
  if (index < 0) {
    return { incoming, outgoing };
  }
  const append = (row: number, column: number, score: number) => {
    if (score <= 0) {
      return;
    }
    if (row === index && column !== index) {
      incoming.push({ from: data.symbols[column].name, to: symbol, score });
    }
    if (column === index && row !== index) {
      outgoing.push({ from: symbol, to: data.symbols[row].name, score });
    }
  };
  if (data.matrixPaths) {
    const readRows = createMatrixReader(data.matrixPaths);
    const indexes = data.symbols.map((_, index) => index);
    readRows([index], indexes)[0].forEach((score, column) => append(index, column, score));
    readRows(indexes, [index]).forEach(([score], row) => append(row, index, score));
  } else {
    data.matrix[index]?.forEach((cell) => append(index, cell.column, cell.value));
    data.matrix.forEach((row, rowIndex) => {
      if (rowIndex !== index) {
        const score = row.find((cell) => cell.column === index)?.value;
        if (score !== undefined) {
          append(rowIndex, index, score);
        }
      }
    });
  }
  const rank = (connections: Relationship[]) =>
    connections.sort((a, b) => b.score - a.score).slice(0, limit);
  return { incoming: rank(incoming), outgoing: rank(outgoing) };
}

export function getGroupDensity(data: BundleInfo, threshold: number, limit = 8) {
  const groups = data.bundles
    .slice(0, limit)
    .map((bundle, index) => ({ label: `Group ${index + 1}`, symbols: bundle.symbols }));
  const remaining = data.bundles.slice(limit);
  if (remaining.length) {
    groups.push({
      label: `Other ${remaining.length} ${remaining.length === 1 ? 'group' : 'groups'}`,
      symbols: remaining.flatMap((bundle) => bundle.symbols),
    });
  }
  const indexes = new Map<string, number>();
  groups.forEach((group, index) =>
    group.symbols.forEach((symbol) => indexes.set(symbol.name, index))
  );
  const cells = groups.map((later, row) =>
    groups.map((preceding, column) => ({
      count: 0,
      possible:
        later.symbols.length * preceding.symbols.length -
        (row === column ? later.symbols.length : 0),
      density: 0,
      strongest: [] as Relationship[],
    }))
  );
  data.matrix.forEach((row, rowIndex) => {
    const to = data.symbols[rowIndex].name;
    const laterGroup = indexes.get(to);
    if (laterGroup === undefined) {
      return;
    }
    for (const cell of row) {
      if (cell.column === rowIndex || cell.value < threshold) {
        continue;
      }
      const from = data.symbols[cell.column].name;
      const precedingGroup = indexes.get(from);
      if (precedingGroup === undefined) {
        continue;
      }
      const summary = cells[laterGroup][precedingGroup];
      summary.count++;
      summary.strongest.push({ from, to, score: cell.value });
    }
  });
  for (const row of cells) {
    for (const cell of row) {
      cell.density = cell.possible ? cell.count / cell.possible : 0;
      cell.strongest = cell.strongest.sort((a, b) => b.score - a.score).slice(0, 3);
    }
  }
  return { groups, cells };
}

export interface ObservedEdge {
  from: string;
  to: string;
  count: number;
}

export function findObservedPath(edges: ObservedEdge[], from: string, to: string, maxSteps = 6) {
  if (!from || !to) {
    return [];
  }
  const adjacency = new Map<string, ObservedEdge[]>();
  for (const edge of edges) {
    const neighbors = adjacency.get(edge.from) ?? [];
    neighbors.push(edge);
    adjacency.set(edge.from, neighbors);
  }
  const queue = [[from]];
  const visited = new Set([from]);
  for (let index = 0; index < queue.length; index++) {
    const path = queue[index];
    const last = path[path.length - 1];
    if (last === to) {
      return path;
    }
    if (path.length > maxSteps) {
      continue;
    }
    for (const edge of (adjacency.get(last) ?? []).sort((a, b) => b.count - a.count)) {
      if (visited.has(edge.to)) {
        continue;
      }
      visited.add(edge.to);
      queue.push([...path, edge.to]);
    }
  }
  return [];
}

export function getExamplePath(edges: ObservedEdge[], knownNames: Set<string>) {
  const namedEdges = edges
    .filter((edge) => knownNames.has(edge.from) && knownNames.has(edge.to))
    .sort((a, b) => b.count - a.count);
  for (const first of namedEdges.slice(0, 32)) {
    const second = namedEdges.find((edge) => edge.from === first.to && edge.to !== first.from);
    if (!second) {
      continue;
    }
    const third = namedEdges.find(
      (edge) => edge.from === second.to && ![first.from, first.to].includes(edge.to)
    );
    const path = findObservedPath(edges, first.from, third?.to ?? second.to);
    if (path.length > 2) {
      return path;
    }
  }
  return namedEdges.length
    ? [namedEdges[0].from, namedEdges[0].to]
    : edges.length
      ? [edges[0].from, edges[0].to]
      : [];
}

export function getObservedEdges(rows: SymbolPairCounts[], names: Set<string>): ObservedEdge[] {
  return rows.flatMap((row) => {
    const count = row.relatedCount + row.unrelatedCount;
    if (
      !row.from ||
      row.from === row.to ||
      !names.has(row.from) ||
      !names.has(row.to) ||
      count <= 0
    ) {
      return [];
    }
    return [{ from: row.from, to: row.to, count }];
  });
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
