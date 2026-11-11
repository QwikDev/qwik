import { BUCKETS, vectorPercentile, vectorSum, type Bucket } from '~/stats/vector';

export const PERFORMANCE_PERCENTILE = 0.95;
export const MIN_PERFORMANCE_SAMPLES = 100;

export function getManifestPerformance(
  latency: number[],
  buckets: Bucket[] = BUCKETS
): {
  samples: number;
  p95: number | null;
} {
  const samples = vectorSum(latency);
  return {
    samples,
    p95:
      samples >= MIN_PERFORMANCE_SAMPLES
        ? vectorPercentile(latency, PERFORMANCE_PERCENTILE, buckets)
        : null,
  };
}

export function comparePerformance(current: number[], previous: number[], buckets = BUCKETS) {
  const selected = getManifestPerformance(current, buckets);
  const baseline = getManifestPerformance(previous, buckets);
  const delta = selected.p95 !== null && baseline.p95 !== null ? selected.p95 - baseline.p95 : null;
  const change =
    delta !== null && baseline.p95 !== null && baseline.p95 > 0
      ? Math.round((delta / baseline.p95) * 100)
      : null;
  return {
    ...selected,
    previousSamples: baseline.samples,
    previousP95: baseline.p95,
    delta,
    change,
  };
}

export function groupSymbolChanges<T extends { change: number | null; delta: number | null }>(
  symbols: T[]
) {
  const groups: { label: string; symbols: T[] }[] = [
    {
      label: 'Higher P95',
      symbols: symbols.filter((symbol) => symbol.change !== null && symbol.change > 0),
    },
    {
      label: 'Lower P95',
      symbols: symbols.filter((symbol) => symbol.change !== null && symbol.change < 0),
    },
    { label: 'Unchanged P95', symbols: symbols.filter((symbol) => symbol.change === 0) },
    {
      label: 'Collecting comparison data',
      symbols: symbols.filter((symbol) => symbol.change === null),
    },
  ];
  return groups
    .map((group) => ({
      ...group,
      symbols: group.symbols
        .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
        .slice(0, 3),
    }))
    .filter((group) => group.symbols.length);
}
