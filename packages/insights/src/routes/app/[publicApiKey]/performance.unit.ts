import { describe, expect, it } from 'vitest';
import { BUCKETS } from '~/stats/vector';
import {
  getManifestPerformance,
  MIN_PERFORMANCE_SAMPLES,
  PERFORMANCE_PERCENTILE,
} from './performance';

describe('manifest performance', () => {
  it('reports P95 after the minimum sample count', () => {
    const latency = Array(50).fill(0);
    latency[0] = 94;
    latency[20] = 6;

    expect(PERFORMANCE_PERCENTILE).toBe(0.95);
    expect(getManifestPerformance(latency)).toEqual({
      samples: MIN_PERFORMANCE_SAMPLES,
      p95: BUCKETS[20].avg,
    });
  });

  it('hides P95 while samples are still collecting', () => {
    expect(getManifestPerformance([MIN_PERFORMANCE_SAMPLES - 1])).toEqual({
      samples: MIN_PERFORMANCE_SAMPLES - 1,
      p95: null,
    });
  });
});
