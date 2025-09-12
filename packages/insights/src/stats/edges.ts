import { DBSCAN } from 'density-clustering';
import { vectorSum2 } from './vector';

export interface Symbol {
  name: string;
  /** Map of dependent symbols sorted by probability of dependency. */
  children: Edge[];
  count: number;
  /** Unmodified name of the symbol. */
  fullName: string | null;
  /** File source of the symbol. */
  fileSrc: string | null;
  /**
   * Depth of the symbol in the graph following the shortest path.
   *
   * Initial value is set to Number.MAX_SAFE_INTEGER
   */
  depth: number;
}

export interface Edge {
  from: Symbol;
  to: Symbol;
  count: number;
  // latency: number;
  // delay: number;
}

export interface SymbolPairs {
  from: string | null;
  to: string;
  delay: number[];
  latency: number[];
}

export interface SymbolDetail {
  hash: string;
  fullName: string;
  origin: string;
}

export function computeSymbolGraph(rows: SymbolPairs[], details?: SymbolDetail[]): Symbol[] {
  const detailMap = new Map<string, SymbolDetail>();
  const edgeMap = new Map<string, Edge>();
  const symbols: Symbol[] = [];
  details && details.forEach((detail) => detailMap.set(detail.hash, detail));
  const symbolMap = new Map<string, Symbol>();
  const rootSymbol = getSymbol('<synthetic.root.symbol>');
  for (const row of rows) {
    fixNames(row);
    const [countRelated, countUnrelated] = vectorSum2(
      row.delay,
      // If previous symbol occurred less than x ms than assume that they are related.
      // if more than x ms than assume that they are unrelated (parent is null).
      250
    );
    const self = getSymbol(row.to);
    self.count += countRelated + countUnrelated;
    if (countRelated) {
      const parent = getSymbol(row.from);
      const edge = getEdge(parent, self);
      edge.count += countRelated;
    }
    if (countUnrelated) {
      const edge = getEdge(rootSymbol, self);
      edge.count += countUnrelated;
    }
  }

  computeDepth(rootSymbol, 0);
  sortEdgesByProbability();

  return symbols;

  /////////////////////////////////////////////////////////

  function sortEdgesByProbability() {
    for (let i = 0; i < symbols.length; i++) {
      const edges = symbols[i].children;
      edges.sort(probabilityComparator);
    }
  }

  function probabilityComparator(a: Edge, b: Edge) {
    return b.count - a.count;
  }

  function computeDepth(symbol: Symbol, distance: number) {
    if (distance < symbol.depth) {
      // shorter path was found.
      symbol.depth = distance;
      const children = Object.values(symbol.children) as Edge[];
      children.forEach((edge) => {
        computeDepth(edge.to, distance + 1);
      });
    }
  }

  function getEdge(parent: Symbol, self: Symbol): Edge {
    const edgeName = parent.name + '->' + self.name;
    let edge = edgeMap.get(edgeName);
    if (!edge) {
      edge = { count: 0, from: parent, to: self };
      parent.children.push(edge);
      edgeMap.set(edgeName, edge);
    }
    return edge;
  }

  function fixNames(row: SymbolPairs) {
    row.to = row.to.split('_').pop()!;
    row.from = row.from == null ? null : row.from.split('_').pop()!;
    if (row.from === 'hW') {
      row.from = null;
    }
  }

  function getSymbol(name: string | null): Symbol {
    if (name === null) {
      return rootSymbol;
    }
    let symbol = symbolMap.get(name);
    if (!symbol) {
      const detail = detailMap.get(name);
      symbol = {
        count: 0,
        name,
        children: [],
        depth: Number.MAX_SAFE_INTEGER,
        fullName: detail?.fullName || null,
        fileSrc: detail?.origin || null,
      };
      symbolMap.set(name, symbol);
      symbols.push(symbol);
    }
    return symbol;
  }
}

export interface SymbolVectors {
  symbols: Symbol[];
  vectors: number[][];
}

export function computeSymbolVectors(symbols: Symbol[]): SymbolVectors {
  const rootSymbol = symbols.shift()!; // remove root symbol
  const symbolVectorIdxMap = new Map<Symbol, number>();
  const vectors: number[][] = [];
  initializeVectorsAndSymbolMap();
  const alreadyVisited = new Set<Symbol>();
  const edgePath: Edge[] = [];
  processChildren(rootSymbol, edgePath, alreadyVisited);
  return { symbols, vectors };
  ////////////////////////////////////////

  function processChildren(symbol: Symbol, edgePath: Edge[], alreadyVisited: Set<Symbol>) {
    const symbolIdx = symbolVectorIdxMap.get(symbol);
    if (symbolIdx !== undefined) {
      let weight = 1;
      const vector = vectors[symbolIdx];
      vector[symbolIdx] = weight; // self weight

      // back-propagate weights to the symbol which caused the dependency.
      // TODO(misko): This algorithm for computing weights is not perfect because
      // it only takes the most frequent path into account.
      // A better approach would be to sum weights along all paths.
      for (let i = edgePath.length - 1; 0 <= i; i--) {
        const edge = edgePath[i];
        const symbolIdx = symbolVectorIdxMap.get(edge.from);
        if (symbolIdx !== undefined) {
          weight = Math.min(1, edge.count / edge.from.count) * weight;
          vector[symbolIdx] = Math.min(1, vector[symbolIdx] + weight);
        }
      }
    }

    if (alreadyVisited.has(symbol)) {
      return;
    }
    alreadyVisited.add(symbol);

    symbol.children.forEach((edge) => {
      edgePath.push(edge);
      processChildren(edge.to, edgePath, alreadyVisited);
      edgePath.pop();
    });
  }

  function initializeVectorsAndSymbolMap() {
    const vector: number[] = [];
    for (let i = 0; i < symbols.length; i++) {
      symbolVectorIdxMap.set(symbols[i], i);
      vector.push(0);
    }
    vectors.push(vector);
    for (let i = 1; i < vector.length; i++) {
      vectors.push(vector.slice());
    }
    return vectors;
  }
}

export interface Bundle {
  name: string;
  symbols: Symbol[];
}

export function computeBundles(symbolVectors: SymbolVectors): Bundle[] {
  const bundles: Bundle[] = [];
  const dbscan = new DBSCAN();
  // We want to set the distance so that it is just below (90%) the distance between two unrelated symbols.
  const maxDistance = 0.95 * Math.sqrt(Math.pow(1, 2) + Math.pow(1, 2));
  const clusters = dbscan.run(symbolVectors.vectors, maxDistance, 1);
  clusters.forEach((cluster) => {
    const symbols = cluster.map((id) => symbolVectors.symbols[id]).filter(Boolean);
    const symbolNames = symbols.map((s) => s.name);
    symbolNames.sort();
    bundles.push({
      name: 'bundle_' + hashCode(symbolNames.join(',')),
      symbols,
    });
  });
  bundles.sort((b1, b2) => b2.symbols.length - b1.symbols.length);
  return bundles;
}

export const hashCode = (text: string, hash: number = 0) => {
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return Number(Math.abs(hash)).toString(36);
};
