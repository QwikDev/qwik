import type { SymbolDetailForApp } from '~/db/query';
import type { RouteSymbolRow } from '~/db/sql-routes';
import { TIMELINE_BUCKETS, vectorPercentile, vectorSum, type Bucket } from '~/stats/vector';
import { MIN_PERFORMANCE_SAMPLES } from '../performance';

export interface RouteSnapshot {
  timeline: number[];
  samples: number;
  p50: number | null;
  p75: number | null;
  p95: number | null;
}

export interface RouteSymbolPerformance {
  hash: string;
  name: string;
  origin: string;
  p95: number;
  samples: number;
  share: number;
  change: number | null;
}

export interface RouteOverview {
  route: string;
  p95: number | null;
  samples: number;
  symbols: number;
  change: number | null;
}

export function getRouteComparison(
  latestRows: RouteSymbolRow[],
  previousRows: RouteSymbolRow[],
  symbolDetails: Pick<SymbolDetailForApp, 'hash' | 'fullName' | 'origin'>[]
): {
  latest: RouteSnapshot;
  previous: RouteSnapshot | null;
  change: number | null;
  symbols: RouteSymbolPerformance[];
} {
  const latest = getRouteSnapshot(latestRows);
  const previous = previousRows.length ? getRouteSnapshot(previousRows) : null;
  const detailsByHash = new Map(symbolDetails.map((symbol) => [symbol.hash, symbol]));
  const previousRowsBySymbol = new Map(previousRows.map((row) => [row.symbol, row]));

  return {
    latest,
    previous,
    change: getPercentageChange(latest.p95, previous?.p95 ?? null),
    symbols: latestRows
      .map((row) => {
        const samples = vectorSum(row.timeline);
        const p95 = vectorPercentile(row.timeline, 0.95, TIMELINE_BUCKETS);
        const previousP95 = vectorPercentile(
          previousRowsBySymbol.get(row.symbol)?.timeline ?? [],
          0.95,
          TIMELINE_BUCKETS
        );
        const details = detailsByHash.get(row.symbol);
        return {
          hash: row.symbol,
          name: details?.fullName ?? row.symbol,
          origin: details?.origin ?? 'Source unavailable',
          p95,
          samples,
          share: latest.samples ? Math.round((samples / latest.samples) * 100) : 0,
          change: getPercentageChange(p95, previousP95 || null),
        };
      })
      .filter((symbol) => symbol.samples * 100 >= latest.samples)
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 5),
  };
}

export function getVisibleTimelineDistribution(
  latest: number[],
  previous: number[]
): {
  latest: number[];
  previous: number[];
  buckets: Bucket[];
} {
  const lastSampleIndex = Math.max(findLastSampleIndex(latest), findLastSampleIndex(previous));
  const length = Math.min(TIMELINE_BUCKETS.length, Math.max(2, lastSampleIndex + 2));
  return {
    latest: latest.slice(0, length),
    previous: previous.slice(0, length),
    buckets: TIMELINE_BUCKETS.slice(0, length),
  };
}

export function getRoutesOverview(
  latestRows: RouteSymbolRow[],
  previousRows: RouteSymbolRow[]
): RouteOverview[] {
  const latestByRoute = groupRowsByRoute(latestRows);
  const previousByRoute = groupRowsByRoute(previousRows);

  return Array.from(latestByRoute, ([route, rows]) => {
    const latest = getRouteSnapshot(rows);
    const previousRowsForRoute = previousByRoute.get(route);
    const previous = previousRowsForRoute ? getRouteSnapshot(previousRowsForRoute) : null;
    return {
      route,
      p95: latest.p95,
      samples: latest.samples,
      symbols: rows.length,
      change: getPercentageChange(latest.p95, previous?.p95 ?? null),
    };
  }).sort((a, b) => (b.p95 ?? -1) - (a.p95 ?? -1) || a.route.localeCompare(b.route));
}

export function getSelectedManifestIndex(
  manifestHashes: string[],
  requestedHash: string | null
): number {
  const requestedIndex = requestedHash ? manifestHashes.indexOf(requestedHash) : -1;
  return requestedIndex < 0 ? 0 : requestedIndex;
}

export function formatManifestDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

function getRouteSnapshot(rows: RouteSymbolRow[]): RouteSnapshot {
  const timeline = TIMELINE_BUCKETS.map((_, index) =>
    rows.reduce((sum, row) => sum + (row.timeline[index] ?? 0), 0)
  );
  const samples = vectorSum(timeline);
  const hasMinimumSamples = samples >= MIN_PERFORMANCE_SAMPLES;
  return {
    timeline,
    samples,
    p50: hasMinimumSamples ? vectorPercentile(timeline, 0.5, TIMELINE_BUCKETS) : null,
    p75: hasMinimumSamples ? vectorPercentile(timeline, 0.75, TIMELINE_BUCKETS) : null,
    p95: hasMinimumSamples ? vectorPercentile(timeline, 0.95, TIMELINE_BUCKETS) : null,
  };
}

function getPercentageChange(latest: number | null, previous: number | null): number | null {
  return latest !== null && previous !== null && previous > 0
    ? Math.round(((latest - previous) / previous) * 100)
    : null;
}

function findLastSampleIndex(vector: number[]): number {
  for (let index = vector.length - 1; index >= 0; index--) {
    if (vector[index]) {
      return index;
    }
  }
  return 0;
}

function groupRowsByRoute(rows: RouteSymbolRow[]): Map<string, RouteSymbolRow[]> {
  const rowsByRoute = new Map<string, RouteSymbolRow[]>();
  for (const row of rows) {
    const routeRows = rowsByRoute.get(row.route);
    if (routeRows) {
      routeRows.push(row);
    } else {
      rowsByRoute.set(row.route, [row]);
    }
  }
  return rowsByRoute;
}
