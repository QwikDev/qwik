import { describe, expect, it } from 'vitest';
import { BUCKETS, TIMELINE_BUCKETS } from '~/stats/vector';
import { formatHistogramRange, getHistogramTicks } from './labels';

describe('histogram labels', () => {
  it('formats bucket ranges without interval notation', () => {
    expect(formatHistogramRange({ min: 4, max: 6 })).toBe('4–6 ms');
    expect(formatHistogramRange({ min: 1000, max: 2000 })).toBe('1–2 s');
  });

  it('uses readable latency and timeline milestones', () => {
    expect(getHistogramTicks(BUCKETS).map((tick) => tick.label)).toEqual([
      '0 ms',
      '10 ms',
      '100 ms',
      '1 s',
      '10 s',
    ]);
    expect(getHistogramTicks(TIMELINE_BUCKETS).map((tick) => tick.label)).toEqual([
      '0 ms',
      '1 s',
      '10 s',
      '1 min',
      '15 min',
    ]);
  });
});
