interface SearchableSymbol {
  hash: string;
  fullName?: string | null;
  origin?: string | null;
  samples: number;
  p95: number | null;
}

export function filterSymbols<T extends SearchableSymbol>(
  symbols: T[],
  search: string | null,
  sort: string | null
): T[] {
  const query = search?.trim().toLowerCase() ?? '';
  return symbols
    .filter((symbol) =>
      [symbol.hash, symbol.fullName, symbol.origin].some((value) =>
        value?.toLowerCase().includes(query)
      )
    )
    .sort((a, b) => {
      if (sort === 'name') {
        return (a.fullName || a.hash).localeCompare(b.fullName || b.hash);
      }
      if (sort === 'p95') {
        return (b.p95 ?? -1) - (a.p95 ?? -1) || b.samples - a.samples;
      }
      return b.samples - a.samples || a.hash.localeCompare(b.hash);
    });
}
