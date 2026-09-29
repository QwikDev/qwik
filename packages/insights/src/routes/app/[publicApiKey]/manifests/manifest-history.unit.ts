import { describe, expect, it } from 'vitest';
import { toBucket, vectorNew } from '~/stats/vector';
import {
  formatManifestTimestamp,
  getManifestHistoryOverview,
  getManifestStatus,
} from './manifest-history';

const latencyVector = (...values: number[]) => {
  const vector = vectorNew();
  for (const value of values) {
    vector[toBucket(value)]++;
  }
  return vector;
};

describe('manifest history', () => {
  it('summarizes all recorded manifest samples', () => {
    expect(
      getManifestHistoryOverview([
        { latency: latencyVector(8, 12) },
        { latency: latencyVector(12, 20) },
      ])
    ).toEqual({
      manifests: 2,
      samples: 4,
      medianLatency: 13.5,
    });
  });

  it('waits for enough samples before classifying P95', () => {
    const rows = [{ latency: latencyVector(8, 40) }, { latency: latencyVector(8, 20) }];

    expect(getManifestStatus(rows, 0)).toBe('Collecting');
    expect(getManifestStatus(rows, 1)).toBe('Baseline');
  });

  it('marks a P95 increase against the previous manifest as a regression', () => {
    const rows = [
      { latency: latencyVector(...Array<number>(100).fill(40)) },
      { latency: latencyVector(...Array<number>(100).fill(20)) },
    ];

    expect(getManifestStatus(rows, 0)).toBe('Regression');
  });

  it('formats the captured date and time in UTC', () => {
    expect(formatManifestTimestamp(new Date('2026-07-10T16:30:43Z'))).toBe(
      'Jul 10, 2026 · 16:30:43'
    );
  });
});
