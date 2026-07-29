export function getBundleExecutionCount(bundle: {
  name: string;
  symbols: { count: number }[];
}): number {
  return bundle.symbols.reduce((total, symbol) => total + symbol.count, 0);
}

export function getMatrixCellColor(value: number): string {
  const strength = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `color-mix(in srgb, var(--color-editorial-data-current) ${strength}%, var(--color-editorial-data-band))`;
}
