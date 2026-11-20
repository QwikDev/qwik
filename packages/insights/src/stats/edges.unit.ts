import { assert, test } from 'vitest';
import { DBSCAN } from 'density-clustering';
import {
  type SymbolPairs,
  type SymbolVectors,
  computeSymbolGraph,
  computeSymbolTree,
  computeSymbolVectors,
  computeBundles,
} from './edges';

function bundleSymbols(count: number): SymbolVectors['symbols'] {
  return Array.from({ length: count }, (_, index) => ({
    name: `symbol-${index}`,
    count: 1,
    depth: 1,
    children: [],
    fullName: null,
    fileSrc: null,
  }));
}

test('keeps bundle membership identical to Euclidean clustering', () => {
  const threshold = 0.95 * Math.sqrt(2);
  for (const vectors of [
    [],
    [[0]],
    [
      [1, 0],
      [1, 0],
    ],
    [
      [0, 0],
      [threshold, 0],
    ],
    [
      [0, 0],
      [threshold - 0.000001, 0],
    ],
    Array.from({ length: 24 }, (_, row) =>
      Array.from({ length: 24 }, (_, column) =>
        row === column ? 1 : (row + column) % 5 === 0 ? ((row * column) % 7) / 7 : 0
      )
    ),
  ]) {
    const symbols = bundleSymbols(vectors.length);
    const expected = new DBSCAN()
      .run(vectors, threshold, 1)
      .map((cluster) =>
        cluster
          .map((index) => symbols[index].name)
          .sort()
          .join(',')
      )
      .sort();
    const actual = computeBundles({ symbols, vectors })
      .map((bundle) =>
        bundle.symbols
          .map((symbol) => symbol.name)
          .sort()
          .join(',')
      )
      .sort();
    assert.deepEqual(actual, expected);
  }
});

test('clusters sparse relationships without repeatedly scanning empty dimensions', () => {
  const count = 100;
  let coordinateReads = 0;
  const vectors = Array.from(
    { length: count },
    (_, row) =>
      new Proxy(
        Array.from({ length: count }, (_, column) => (row === column ? 1 : 0)),
        {
          get(vector, key, receiver) {
            if (typeof key === 'string' && /^\d+$/.test(key)) {
              coordinateReads++;
            }
            return Reflect.get(vector, key, receiver);
          },
        }
      )
  );
  const bundles = computeBundles({ symbols: bundleSymbols(count), vectors });
  assert.lengthOf(bundles, count);
  assert.isAtMost(coordinateReads, count * count * 2);
});

test('empty graph', () => {
  assert.deepEqual(computeSymbolVectors(computeSymbolGraph([])), {
    symbols: [],
    vectors: [],
  });
});

test('pre-aggregated graph counts', () => {
  const graph = computeSymbolGraph([
    { from: 'parent', to: 'child', relatedCount: 2, unrelatedCount: 3 },
  ]);
  const root = graph[0];
  const child = graph.find((symbol) => symbol.name === 'child')!;
  const parent = graph.find((symbol) => symbol.name === 'parent')!;

  assert.equal(child.count, 5);
  assert.equal(parent.children[0].count, 2);
  assert.equal(root.children[0].count, 3);
});

test('expands a shared symbol only once', () => {
  const graph = computeSymbolGraph([
    edge('->a'),
    edge('a->b'),
    edge('a->c'),
    edge('b->d'),
    edge('c->d'),
    edge('d->e'),
  ]);
  const tree = computeSymbolTree(graph[0]);
  const names: string[] = [];
  visit(tree);

  assert.equal(names.filter((name) => name === 'd').length, 2);
  assert.equal(names.filter((name) => name === 'e').length, 1);

  function visit(symbol: typeof tree) {
    names.push(symbol.name);
    symbol.children.forEach((child) => visit(child.to));
  }
});

test('simple paths', () => {
  const graph = computeSymbolGraph([edge('->a'), edge('a->b'), edge('b->c'), edge('c->d')]);
  const symbolVectors = computeSymbolVectors(graph);
  const result = toResult(symbolVectors);
  assert.deepEqual(result, {
    // How to think about this table:
    // 1. The top row is the FROM symbol.
    // 2. The left column is the TO symbol.
    // 3. The value is the probability given that we start at
    //    FROM symbol what is the probability that we end up at TO symbol.
    // NOTE: the diagonal is always 1.0 because it is the identity.
    //
    //  FROM
    //   a    b    c    d
    a: [1.0, 0.0, 0.0, 0.0],
    b: [1.0, 1.0, 0.0, 0.0],
    c: [1.0, 1.0, 1.0, 0.0],
    d: [1.0, 1.0, 1.0, 1.0],
  });
});

test('diamond', () => {
  const graph = computeSymbolGraph([
    edge('->a'),
    edge('->a'),
    edge('a->b'),
    edge('a->c'),
    edge('b->d'),
    edge('c->d'),
  ]);
  const symbolVectors = computeSymbolVectors(graph);
  const result = toResult(symbolVectors);
  assert.deepEqual(result, {
    // How to think about this table:
    // 1. The top row is the FROM symbol.
    // 2. The left column is the TO symbol.
    // 3. The value is the probability given that we start at
    //    FROM symbol what is the probability that we end up at TO symbol.
    // NOTE: the diagonal is always 1.0 because it is the identity.
    //
    //  FROM
    //   a    b    c    d
    a: [1.0, 0.0, 0.0, 0.0],
    b: [0.5, 1.0, 0.0, 0.0],
    c: [0.5, 0.0, 1.0, 0.0],
    d: [1.0, 1.0, 1.0, 1.0],
  });
});

test('lopsided diamond', () => {
  const graph = computeSymbolGraph([
    edge('->a'),
    edge('->a'),
    edge('->a'),
    edge('a->b'),
    edge('a->b'),
    edge('a->c'),
    edge('b->d'),
    edge('b->d'),
    edge('c->d'),
  ]);
  const symbolVectors = computeSymbolVectors(graph);
  const result = toResult(symbolVectors);
  assert.deepEqual(result, {
    // How to think about this table:
    // 1. The top row is the FROM symbol.
    // 2. The left column is the TO symbol.
    // 3. The value is the probability given that we start at
    //    FROM symbol what is the probability that we end up at TO symbol.
    // NOTE: the diagonal is always 1.0 because it is the identity.
    //
    //  FROM
    //   a    b    c    d
    a: [1.0, 0.0, 0.0, 0.0],
    b: [2 / 3, 1.0, 0.0, 0.0],
    c: [1 / 3, 0.0, 1.0, 0.0],
    d: [1.0, 1.0, 1.0, 1.0],
  });
});

test('incomplete diamond', () => {
  const graph = computeSymbolGraph([
    edge('->a'),
    edge('->a'),
    edge('a->b'),
    edge('a->c'),
    edge('b->d'),
  ]);
  const symbolVectors = computeSymbolVectors(graph);
  const result = toResult(symbolVectors);
  assert.deepEqual(result, {
    // How to think about this table:
    // 1. The top row is the FROM symbol.
    // 2. The left column is the TO symbol.
    // 3. The value is the probability given that we start at
    //    FROM symbol what is the probability that we end up at TO symbol.
    // NOTE: the diagonal is always 1.0 because it is the identity.
    //
    //  FROM
    //   a    b    c    d
    a: [1.0, 0.0, 0.0, 0.0],
    b: [0.5, 1.0, 0.0, 0.0],
    c: [0.5, 0.0, 1.0, 0.0],
    d: [0.5, 1.0, 0.0, 1.0],
  });
});

function edge(name: string): SymbolPairs {
  const parts = name.split('->');
  return {
    from: parts[0] || null,
    to: parts[1],
    delay: [1],
    latency: [1],
  };
}

function toResult(symbolVectors: SymbolVectors): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  const symbols = symbolVectors.symbols;
  const vectors = symbolVectors.vectors;
  for (let i = 0; i < symbols.length; i++) {
    result[symbols[i].name] = vectors[i];
  }
  return result;
}
