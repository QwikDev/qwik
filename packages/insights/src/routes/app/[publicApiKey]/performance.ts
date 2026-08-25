import { vectorPercentile, vectorSum } from '~/stats/vector';

export const PERFORMANCE_PERCENTILE = 0.95;
export const MIN_PERFORMANCE_SAMPLES = 100;

export function getManifestPerformance(latency: number[]): {
  samples: number;
  p95: number | null;
} {
  const samples = vectorSum(latency);
  return {
    samples,
    p95:
      samples >= MIN_PERFORMANCE_SAMPLES ? vectorPercentile(latency, PERFORMANCE_PERCENTILE) : null,
  };
}
