import { describe, expect, it } from 'vitest';
import { TIMELINE_BUCKETS, toBucketTimeline, vectorNew } from '~/stats/vector';
import {
  formatManifestDate,
  getRouteComparison,
  getRoutesOverview,
  getSelectedManifestIndex,
  getVisibleTimelineDistribution,
} from './route-performance';

describe('route performance', () => {
  it('compares the latest route timeline with the previous manifest', () => {
    const latest = [routeRow('checkout', 'useCheckout', 2_000, 100)];
    const previous = [routeRow('checkout', 'useCheckout', 1_000, 100)];

    const comparison = getRouteComparison(latest, previous, [
      {
        hash: 'useCheckout',
        fullName: 'useCheckoutQrl',
        origin: 'components/checkout.tsx',
      },
    ]);

    expect(comparison.latest.samples).toBe(100);
    expect(comparison.latest.p95).toBe(TIMELINE_BUCKETS[toBucketTimeline(2_000)].avg);
    expect(comparison.previous?.p95).toBe(TIMELINE_BUCKETS[toBucketTimeline(1_000)].avg);
    expect(comparison.change).toBeGreaterThan(0);
    expect(comparison.symbols).toEqual([
      expect.objectContaining({
        hash: 'useCheckout',
        name: 'useCheckoutQrl',
        origin: 'components/checkout.tsx',
        samples: 100,
        share: 100,
      }),
    ]);
  });

  it('does not report percentiles or a change before enough samples arrive', () => {
    const comparison = getRouteComparison(
      [routeRow('checkout', 'useCheckout', 2_000, 99)],
      [routeRow('checkout', 'useCheckout', 1_000, 100)],
      []
    );

    expect(comparison.latest.p50).toBeNull();
    expect(comparison.latest.p75).toBeNull();
    expect(comparison.latest.p95).toBeNull();
    expect(comparison.change).toBeNull();
  });

  it('excludes one-off outliers from the late symbols table', () => {
    const comparison = getRouteComparison(
      [routeRow('checkout', 'common', 2_000, 100), routeRow('checkout', 'outlier', 900_000, 1)],
      [],
      []
    );

    expect(comparison.symbols.map((symbol) => symbol.hash)).toEqual(['common']);
  });

  it('trims empty tail buckets from the comparative chart', () => {
    const latest = vectorAt(2_000, 10);
    const previous = vectorAt(1_000, 10);
    const distribution = getVisibleTimelineDistribution(latest, previous);

    expect(distribution.buckets.at(-1)?.max).toBeGreaterThan(2_000);
    expect(distribution.buckets.length).toBeLessThan(TIMELINE_BUCKETS.length);
    expect(distribution.latest).toHaveLength(distribution.buckets.length);
    expect(distribution.previous).toHaveLength(distribution.buckets.length);
  });

  it('summarizes routes from the latest manifest', () => {
    const overview = getRoutesOverview(
      [
        routeRow('/checkout', 'useCheckout', 2_000, 100),
        routeRow('/products', 'loadProducts', 1_000, 100),
      ],
      [
        routeRow('/checkout', 'useCheckout', 1_000, 100),
        routeRow('/products', 'loadProducts', 1_000, 100),
      ]
    );

    expect(overview.map((route) => route.route)).toEqual(['/checkout', '/products']);
    expect(overview[0]).toEqual(
      expect.objectContaining({
        p95: TIMELINE_BUCKETS[toBucketTimeline(2_000)].avg,
        samples: 100,
        symbols: 1,
      })
    );
    expect(overview[0].change).toBeGreaterThan(0);
  });

  it('selects a requested manifest and falls back to the latest', () => {
    const manifests = ['latest', 'previous', 'older'];

    expect(getSelectedManifestIndex(manifests, 'older')).toBe(2);
    expect(getSelectedManifestIndex(manifests, 'missing')).toBe(0);
    expect(getSelectedManifestIndex(manifests, null)).toBe(0);
  });

  it('formats manifest timestamps with a date and time', () => {
    expect(formatManifestDate('2026-07-29T16:42:00.000Z')).toBe('Jul 29, 2026, 16:42');
  });
});

function routeRow(route: string, symbol: string, time: number, samples: number) {
  return { route, symbol, timeline: vectorAt(time, samples) };
}

function vectorAt(time: number, samples: number): number[] {
  const vector = vectorNew();
  vector[toBucketTimeline(time)] = samples;
  return vector;
}
