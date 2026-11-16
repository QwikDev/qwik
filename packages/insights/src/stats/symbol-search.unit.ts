import { expect, test } from 'vitest';
import { filterSymbols } from './symbol-search';

test('searches names, hashes, and source paths before sorting without mutating input', () => {
  const symbols = [
    { hash: 'b', fullName: 'Checkout', origin: 'routes/cart.tsx', samples: 20, p95: null },
    { hash: 'a', fullName: 'Search', origin: 'search.tsx', samples: 100, p95: 400 },
    { hash: 'c', fullName: 'Checkout', origin: 'cart.tsx', samples: 150, p95: 200 },
  ];
  expect(filterSymbols(symbols, ' CART ', 'samples').map((row) => row.hash)).toEqual(['c', 'b']);
  expect(filterSymbols(symbols, 'a', 'p95').map((row) => row.hash)).toEqual(['a', 'c', 'b']);
  expect(filterSymbols(symbols, 'missing', 'samples')).toEqual([]);
  expect(symbols.map((row) => row.hash)).toEqual(['b', 'a', 'c']);
});
