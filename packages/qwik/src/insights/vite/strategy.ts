import { NUMBER_OF_BUCKETS, padBucket, vectorSum2 } from '../buckets';
import { openInsightsDb } from '../db';

/**
 * Build-time bundling strategy computed from a local insights database — the decentralized
 * replacement for fetching `/bundles/strategy/` from the central Insights service. The graph,
 * vector and clustering logic mirrors packages/insights/src/stats/edges.ts.
 */
export interface InsightStrategy {
  manual: Record<string, string>;
  prefetch: { route: string; symbols: string[] }[];
}

// --- Symbol graph + vectors + bundles (mirror of stats/edges.ts) --------------
interface Sym {
  name: string;
  children: SymEdge[];
  count: number;
  depth: number;
}
interface SymEdge {
  from: Sym;
  to: Sym;
  count: number;
}
interface SymbolPair {
  from: string | null;
  to: string;
  delay: number[];
}

function computeSymbolGraph(rows: SymbolPair[]): Sym[] {
  const edgeMap = new Map<string, SymEdge>();
  const symbolMap = new Map<string, Sym>();
  const symbols: Sym[] = [];
  const rootSymbol = getSymbol('<synthetic.root.symbol>');

  for (const row of rows) {
    fixNames(row);
    // Related if the previous symbol loaded < 250ms earlier, else treat as an independent root.
    const [countRelated, countUnrelated] = vectorSum2(row.delay, 250);
    const self = getSymbol(row.to);
    self.count += countRelated + countUnrelated;
    if (countRelated) {
      getEdge(getSymbol(row.from), self).count += countRelated;
    }
    if (countUnrelated) {
      getEdge(rootSymbol, self).count += countUnrelated;
    }
  }

  computeDepth(rootSymbol, 0);
  for (const symbol of symbols) {
    symbol.children.sort((a, b) => b.count - a.count);
  }
  return symbols;

  function computeDepth(symbol: Sym, distance: number) {
    if (distance < symbol.depth) {
      symbol.depth = distance;
      symbol.children.forEach((edge) => computeDepth(edge.to, distance + 1));
    }
  }
  function getEdge(parent: Sym, self: Sym): SymEdge {
    const name = parent.name + '->' + self.name;
    let edge = edgeMap.get(name);
    if (!edge) {
      edge = { count: 0, from: parent, to: self };
      parent.children.push(edge);
      edgeMap.set(name, edge);
    }
    return edge;
  }
  function fixNames(row: { from: string | null; to: string }) {
    row.to = row.to.split('_').pop()!;
    row.from = row.from == null ? null : row.from.split('_').pop()!;
    if (row.from === 'hW') {
      row.from = null;
    }
  }
  function getSymbol(name: string | null): Sym {
    if (name === null) {
      return rootSymbol;
    }
    let symbol = symbolMap.get(name);
    if (!symbol) {
      symbol = { count: 0, name, children: [], depth: Number.MAX_SAFE_INTEGER };
      symbolMap.set(name, symbol);
      symbols.push(symbol);
    }
    return symbol;
  }
}

interface SymbolVectors {
  symbols: Sym[];
  vectors: number[][];
}

function computeSymbolVectors(symbols: Sym[]): SymbolVectors {
  const rootSymbol = symbols.shift()!; // drop the synthetic root
  const symbolVectorIdxMap = new Map<Sym, number>();
  const vectors: number[][] = [];

  const base: number[] = [];
  for (let i = 0; i < symbols.length; i++) {
    symbolVectorIdxMap.set(symbols[i], i);
    base.push(0);
  }
  if (base.length > 0) {
    vectors.push(base);
  }
  for (let i = 1; i < base.length; i++) {
    vectors.push(base.slice());
  }

  processChildren(rootSymbol, [], new Set());
  return { symbols, vectors };

  function processChildren(symbol: Sym, edgePath: SymEdge[], visited: Set<Sym>) {
    const symbolIdx = symbolVectorIdxMap.get(symbol);
    if (symbolIdx !== undefined) {
      let weight = 1;
      const vector = vectors[symbolIdx];
      vector[symbolIdx] = weight;
      for (let i = edgePath.length - 1; 0 <= i; i--) {
        const edge = edgePath[i];
        const fromIdx = symbolVectorIdxMap.get(edge.from);
        if (fromIdx !== undefined) {
          weight = Math.min(1, edge.count / edge.from.count) * weight;
          vector[fromIdx] = Math.min(1, vector[fromIdx] + weight);
        }
      }
    }
    if (visited.has(symbol)) {
      return;
    }
    visited.add(symbol);
    symbol.children.forEach((edge) => {
      edgePath.push(edge);
      processChildren(edge.to, edgePath, visited);
      edgePath.pop();
    });
  }
}

const hashCode = (text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

// DBSCAN with minPoints=1 is just connected components of the eps-neighborhood graph.
function computeBundles({ symbols, vectors }: SymbolVectors): { name: string; symbols: Sym[] }[] {
  const n = vectors.length;
  const maxDistance = 0.95 * Math.SQRT2;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      x = parent[x] = parent[parent[x]];
    }
    return x;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < vectors[i].length; k++) {
        const d = vectors[i][k] - vectors[j][k];
        sum += d * d;
      }
      if (Math.sqrt(sum) <= maxDistance) {
        parent[find(i)] = find(j);
      }
    }
  }
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    (clusters.get(root) ?? clusters.set(root, []).get(root)!).push(i);
  }
  const bundles = [...clusters.values()].map((ids) => {
    const clusterSymbols = ids.map((id) => symbols[id]).filter(Boolean);
    const names = clusterSymbols.map((s) => s.name).sort();
    return { name: 'bundle_' + hashCode(names.join(',')), symbols: clusterSymbols };
  });
  bundles.sort((a, b) => b.symbols.length - a.symbols.length);
  return bundles;
}

// --- DB reads -----------------------------------------------------------------
const delaySumColumns = Array.from(
  { length: NUMBER_OF_BUCKETS },
  (_, i) => `SUM(delay_count_${padBucket(i)}) d${i}`
).join(', ');

async function readEdges(dbUrl: string, publicApiKey: string, authToken?: string) {
  const db = await openInsightsDb(dbUrl, authToken);
  try {
    // ponytail: aggregate across all manifests. Filter to recent builds if stale data ever skews it.
    const rows = await db.all(
      `SELECT "from", "to", ${delaySumColumns} FROM edges WHERE public_api_key = ? GROUP BY "from", "to" LIMIT 5000`,
      [publicApiKey]
    );
    const edges: SymbolPair[] = rows.map((r) => ({
      from: r.from,
      to: r.to,
      delay: Array.from({ length: NUMBER_OF_BUCKETS }, (_, i) => Number(r[`d${i}`]) || 0),
    }));
    const routes = (await db.all(
      `SELECT DISTINCT route, symbol FROM routes WHERE public_api_key = ?`,
      [publicApiKey]
    )) as { route: string; symbol: string }[];
    return { edges, routes };
  } finally {
    db.close();
  }
}

/** Read the insights DB and compute a `{ manual, prefetch }` bundling strategy locally. */
export async function computeInsightsStrategy(
  dbUrl: string,
  publicApiKey: string,
  authToken?: string
): Promise<InsightStrategy> {
  const { edges, routes } = await readEdges(dbUrl, publicApiKey, authToken);

  const symbols = computeSymbolGraph(edges);
  const bundles = computeBundles(computeSymbolVectors(symbols));
  const manual: Record<string, string> = {};
  bundles.forEach((bundle) => {
    bundle.symbols.forEach((symbol) => {
      manual[symbol.name] = bundle.name;
    });
  });

  const routeMap = new Map<string, { route: string; symbols: string[] }>();
  for (const { route, symbol } of routes) {
    let entry = routeMap.get(route);
    if (!entry) {
      routeMap.set(route, (entry = { route, symbols: [] }));
    }
    entry.symbols.push(symbol);
  }

  return { manual, prefetch: [...routeMap.values()] };
}
