import { describe, expect, it } from 'vitest';
import { BUCKETS, vectorNew } from '~/stats/vector';
import {
  getManifestPerformance,
  comparePerformance,
  groupSymbolChanges,
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

  it('hides P95 before any samples arrive', () => {
    expect(getManifestPerformance(vectorNew())).toEqual({
      samples: 0,
      p95: null,
    });
  });
});

describe('symbol comparisons', () => {
  it('requires sufficient observations in both builds', () => {
    expect(comparePerformance([0, 2], [100])).toMatchObject({
      p95: null,
      previousSamples: 100,
      change: null,
    });
    expect(comparePerformance([0, 100], [2])).toMatchObject({
      previousP95: null,
      samples: 100,
      change: null,
    });
    expect(comparePerformance([0, 100], [100]).change).toBeGreaterThan(0);
  });

  it('separates increases from decreases and incomplete comparisons', () => {
    const groups = groupSymbolChanges([
      { hash: 'better', change: -80, delta: -100 },
      { hash: 'worse', change: 20, delta: 50 },
      { hash: 'small', change: null, delta: null },
      { hash: 'same', change: 0, delta: 0 },
      { hash: 'largest', change: 10, delta: 200 },
    ]);
    expect(
      groups.map((group) => [group.label, group.symbols.map((symbol) => symbol.hash)])
    ).toEqual([
      ['Higher P95', ['largest', 'worse']],
      ['Lower P95', ['better']],
      ['Unchanged P95', ['same']],
      ['Collecting comparison data', ['small']],
    ]);
  });
});
