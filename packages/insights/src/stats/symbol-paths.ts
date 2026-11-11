import type { Symbol } from './edges';

export type SymbolPathNode = Omit<Symbol, 'children'> & {
  children: { to: number; count: number }[];
};

export function createSymbolPaths(symbols: Symbol[]): SymbolPathNode[] {
  const indexes = new Map(symbols.map((symbol, index) => [symbol, index]));
  return symbols.map(({ children, ...symbol }) => ({
    ...symbol,
    children: children.map(({ to, count }) => ({ to: indexes.get(to)!, count })),
  }));
}

export function getPathChildren(
  symbols: SymbolPathNode[],
  index: number,
  ancestors: number[]
): SymbolPathNode['children'] {
  return ancestors.includes(index) ? [] : symbols[index].children;
}
