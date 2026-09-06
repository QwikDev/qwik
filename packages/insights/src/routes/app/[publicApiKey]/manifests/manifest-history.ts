import { BUCKETS, vectorAvg, vectorPercentile, vectorSum } from '~/stats/vector';
import { getManifestPerformance } from '../performance';

interface ManifestLatency {
  latency: number[];
}

export function getManifestHistoryOverview(rows: ManifestLatency[]): {
  manifests: number;
  samples: number;
  medianLatency: number | null;
} {
  const latency = BUCKETS.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.latency[index] ?? 0), 0)
  );
  const samples = vectorSum(latency);
  return {
    manifests: rows.length,
    samples,
    medianLatency: samples ? vectorPercentile(latency, 0.5) : null,
  };
}

export function getManifestAverage(latency: number[]): number | null {
  return vectorSum(latency) ? vectorAvg(latency) : null;
}

export function getManifestStatus(
  rows: ManifestLatency[],
  index: number
): 'Baseline' | 'Collecting' | 'Regression' | 'Stable' {
  const current = rows.at(index)?.latency;
  const previous = rows.at(index + 1)?.latency;
  if (!current || !previous) {
    return 'Baseline';
  }
  const currentP95 = getManifestPerformance(current).p95;
  const previousP95 = getManifestPerformance(previous).p95;
  if (currentP95 === null || previousP95 === null) {
    return 'Collecting';
  }
  return currentP95 > previousP95 ? 'Regression' : 'Stable';
}

export function formatManifestTimestamp(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const capturedDate = date.toLocaleDateString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const capturedTime = date.toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${capturedDate} · ${capturedTime}`;
}
