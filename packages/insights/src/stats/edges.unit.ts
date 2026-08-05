import { assert, test } from 'vitest';
import {
  type SymbolPairs,
  type SymbolVectors,
  computeSymbolGraph,
  computeSymbolTree,
  computeSymbolVectors,
} from './edges';

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
