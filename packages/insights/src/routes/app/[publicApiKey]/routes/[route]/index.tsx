import { component$ } from '@qwik.dev/core';
import { routeLoader$, useLocation, type DocumentHead } from '@qwik.dev/router';
import Histogram, { currentColors, previousColors } from '~/components/histogram';
import { getDB } from '~/db';
import { getSymbolDetails } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { getRouteTimeline } from '~/db/sql-routes';
import { MIN_PERFORMANCE_SAMPLES } from '../../performance';
import {
  getRouteComparison,
  getSelectedManifestIndex,
  getVisibleTimelineDistribution,
  type RouteSnapshot,
  type RouteSymbolPerformance,
} from '../route-performance';
import type { Bucket } from '~/stats/vector';

export const head: DocumentHead = {
  title: 'Route timeline | Qwik Insights',
};

export const useRouteData = routeLoader$(async ({ params, url }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const route = params.route;
  const manifestHashes = await dbGetManifestHashes(db, publicApiKey, { limit: 101 });
  const selectedIndex = getSelectedManifestIndex(
    manifestHashes.slice(0, 100),
    url.searchParams.get('manifest')
  );
  const selectedHash = manifestHashes.at(selectedIndex);
  const previousHash = manifestHashes.at(selectedIndex + 1);
  const comparedHashes = [selectedHash, previousHash].filter((hash): hash is string =>
    Boolean(hash)
  );
  const [selectedRows, previousRows, symbolDetails] = await Promise.all([
    selectedHash ? getRouteTimeline(db, publicApiKey, route, [selectedHash]) : [],
    previousHash ? getRouteTimeline(db, publicApiKey, route, [previousHash]) : [],
    comparedHashes.length
      ? getSymbolDetails(db, publicApiKey, { manifestHashes: comparedHashes })
      : [],
  ]);
  const comparison = getRouteComparison(selectedRows, previousRows, symbolDetails);

  return {
    ...comparison,
    distribution: getVisibleTimelineDistribution(
      comparison.latest.timeline,
      comparison.previous?.timeline ?? []
    ),
    selectedHash: selectedHash ?? null,
    previousHash: previousHash ?? null,
  };
});

export default component$(() => {
  const data = useRouteData();
  const route = useLocation().params.route;
  return <RouteDetailView route={route} data={data.value} />;
});

export interface RouteDetailViewData {
  latest: RouteSnapshot;
  previous: RouteSnapshot | null;
  change: number | null;
  symbols: RouteSymbolPerformance[];
  distribution: {
    latest: number[];
    previous: number[];
    buckets: Bucket[];
  };
  selectedHash: string | null;
  previousHash: string | null;
}

export const RouteDetailView = component$<{
  route: string;
  data: RouteDetailViewData;
}>(({ route, data }) => {
  const { latest, previous, change } = data;
  const isRegression = change !== null && change > 0;
  const isImprovement = change !== null && change < 0;
  const status = getStatus(latest, previous, change);
  const headline = getHeadline(latest, previous, change);

  return (
    <div class="font-editorial-ui text-editorial-primary">
      <header class="flex flex-col gap-editorial-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
            Route detail
          </p>
          <h1 class="mt-editorial-3 text-editorial-44 font-bold leading-[1.1] tracking-[-0.035em]">
            Route timeline distribution
          </h1>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            <code class="font-editorial-mono text-editorial-link">{route}</code>
            {' · '}
            {getRouteSummary(latest, previous)}
          </p>
        </div>
        <div class="shrink-0 text-left md:text-right">
          <p class="text-editorial-12 font-semibold">Selected vs previous manifest</p>
          <p class="mt-editorial-1 max-w-64 truncate font-editorial-mono text-editorial-11 text-editorial-muted">
            {data.selectedHash ?? 'Waiting for data'}
            {data.previousHash && ` / ${data.previousHash}`}
          </p>
        </div>
      </header>

      <section
        class={[
          'mt-editorial-8 flex flex-col gap-editorial-5 border-l-4 pl-editorial-5 md:flex-row md:items-center md:justify-between',
          isRegression
            ? 'border-editorial-danger'
            : isImprovement
              ? 'border-editorial-success'
              : 'border-editorial-accent',
        ]}
        aria-labelledby="route-status-title"
      >
        <div>
          <p
            class={[
              'text-editorial-11 font-semibold tracking-[0.04em] uppercase',
              isRegression
                ? 'text-editorial-danger'
                : isImprovement
                  ? 'text-editorial-success'
                  : 'text-editorial-link',
            ]}
          >
            {status}
          </p>
          <h2
            id="route-status-title"
            class="mt-editorial-3 text-editorial-24 font-semibold leading-[1.25] tracking-[-0.02em]"
          >
            {headline}
          </h2>
        </div>
        <a
          href="#late-symbols"
          class="shrink-0 text-editorial-14 font-semibold text-editorial-link hover:text-editorial-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-editorial-accent"
        >
          Review symbols →
        </a>
      </section>

      <section class="mt-editorial-10 grid min-w-0 gap-editorial-10 lg:grid-cols-[minmax(0,1fr)_316px]">
        <div class="min-w-0 lg:pr-editorial-8">
          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
            Distribution · timeline samples
          </p>
          <h2 class="mt-editorial-3 text-editorial-24 font-semibold tracking-[-0.02em]">
            {getDistributionHeadline(latest, previous, change)}
          </h2>

          <div class="mt-editorial-5 flex flex-wrap gap-x-editorial-8 gap-y-editorial-3 text-editorial-12 text-editorial-secondary">
            <Legend tone="current" label="Selected manifest" />
            {previous && <Legend tone="previous" label="Previous manifest" />}
          </div>

          {latest.samples ? (
            <div class="mt-editorial-8 overflow-x-auto">
              <Histogram
                ariaLabel="Route timeline samples by manifest"
                class="max-w-none"
                chartClass="h-editorial-chart-tall"
                vector={data.distribution.latest}
                seriesLabel="Selected manifest"
                colors={currentColors}
                buckets={data.distribution.buckets}
                comparison={
                  previous
                    ? {
                        label: 'Previous manifest',
                        vector: data.distribution.previous,
                        colors: previousColors,
                      }
                    : undefined
                }
              />
              <p class="mt-editorial-2 text-center text-editorial-11 text-editorial-muted">
                Time since the route timeline began
              </p>
            </div>
          ) : (
            <p class="mt-editorial-8 border-t border-editorial-border py-editorial-8 text-editorial-14 text-editorial-secondary">
              Timeline samples will appear after symbols are recorded for this route.
            </p>
          )}
        </div>

        <aside class="border-t border-editorial-border pt-editorial-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-editorial-8">
          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
            Distribution summary
          </p>
          <dl class="mt-editorial-3">
            <Metric label="P50" value={formatNullableDuration(latest.p50)} />
            <Metric label="P75" value={formatNullableDuration(latest.p75)} />
            <Metric
              label="P95"
              value={formatNullableDuration(latest.p95)}
              tone={isRegression ? 'danger' : isImprovement ? 'success' : undefined}
            />
            <Metric label="Samples" value={latest.samples.toLocaleString('en')} />
            <Metric
              label="P95 change"
              value={formatChange(change)}
              tone={isRegression ? 'danger' : isImprovement ? 'success' : undefined}
            />
          </dl>
          {latest.samples > 0 && latest.samples < MIN_PERFORMANCE_SAMPLES && (
            <p class="mt-editorial-5 text-editorial-12 leading-[1.5] text-editorial-secondary">
              Percentiles appear after {MIN_PERFORMANCE_SAMPLES} samples. Current:{' '}
              {latest.samples.toLocaleString('en')}.
            </p>
          )}
        </aside>
      </section>

      <section
        id="late-symbols"
        class="mt-editorial-8 border-t border-editorial-border pt-editorial-6"
        aria-labelledby="late-symbols-title"
      >
        <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
          Late timeline symbols
        </p>
        <h2 id="late-symbols-title" class="sr-only">
          Symbols appearing late in the route timeline
        </h2>
        {data.symbols.length ? (
          <div class="mt-editorial-3 overflow-x-auto">
            <table class="w-full min-w-[720px] text-left text-editorial-12">
              <thead class="border-b border-editorial-border text-editorial-11 tracking-[0.04em] text-editorial-muted uppercase">
                <tr>
                  <th class="py-editorial-3 font-semibold">Symbol</th>
                  <th class="py-editorial-3 font-semibold">Source</th>
                  <th class="py-editorial-3 font-semibold">P95 timeline</th>
                  <th class="py-editorial-3 font-semibold">Sample share</th>
                  <th class="py-editorial-3 font-semibold">Change</th>
                </tr>
              </thead>
              <tbody>
                {data.symbols.map((symbol) => (
                  <tr key={symbol.hash} class="border-b border-editorial-border">
                    <td class="max-w-64 truncate py-editorial-4 font-editorial-mono font-semibold text-editorial-link">
                      {symbol.name}
                    </td>
                    <td class="max-w-80 truncate py-editorial-4 font-editorial-mono text-editorial-muted">
                      {symbol.origin}
                    </td>
                    <td class="py-editorial-4 font-semibold">{formatDuration(symbol.p95)}</td>
                    <td class="py-editorial-4 text-editorial-secondary">{symbol.share}%</td>
                    <td
                      class={[
                        'py-editorial-4 font-semibold',
                        symbol.change !== null && symbol.change > 0 && 'text-editorial-danger',
                        symbol.change !== null && symbol.change < 0 && 'text-editorial-success',
                      ]}
                    >
                      {formatChange(symbol.change)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p class="mt-editorial-5 text-editorial-14 text-editorial-secondary">
            No symbol samples are available for the selected manifest.
          </p>
        )}
      </section>
    </div>
  );
});

const Legend = component$<{ label: string; tone: 'current' | 'previous' }>(({ label, tone }) => (
  <span class="flex items-center gap-editorial-2">
    <span
      class={[
        'h-editorial-3 w-editorial-3 rounded-editorial-xs',
        tone === 'current' ? 'bg-editorial-data-current' : 'bg-editorial-data-previous',
      ]}
      aria-hidden="true"
    />
    {label}
  </span>
));

const Metric = component$<{
  label: string;
  tone?: 'danger' | 'success';
  value: string;
}>(({ label, tone, value }) => (
  <div class="flex items-center justify-between border-b border-editorial-border py-editorial-4">
    <dt class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
      {label}
    </dt>
    <dd
      class={[
        'text-editorial-20 font-semibold',
        tone === 'danger' && 'text-editorial-danger',
        tone === 'success' && 'text-editorial-success',
      ]}
    >
      {value}
    </dd>
  </div>
));

function getStatus(
  latest: RouteSnapshot,
  previous: RouteSnapshot | null,
  change: number | null
): string {
  if (!latest.samples) {
    return 'No route data';
  }
  if (!previous) {
    return 'Baseline collecting';
  }
  if (change === null) {
    return 'Collecting comparison data';
  }
  if (change > 0) {
    return 'Tail regression';
  }
  if (change < 0) {
    return 'Tail improvement';
  }
  return 'Timeline stable';
}

function getHeadline(
  latest: RouteSnapshot,
  previous: RouteSnapshot | null,
  change: number | null
): string {
  if (!latest.samples) {
    return 'Waiting for symbol executions on this route.';
  }
  if (!previous) {
    return 'The selected manifest is establishing a baseline.';
  }
  if (change === null) {
    return `Comparison starts at ${MIN_PERFORMANCE_SAMPLES} samples per manifest.`;
  }
  if (change > 0) {
    return 'Symbol executions now appear later in the route timeline.';
  }
  if (change < 0) {
    return 'Symbol executions now appear earlier in the route timeline.';
  }
  return 'The route timeline is unchanged between manifests.';
}

function getRouteSummary(latest: RouteSnapshot, previous: RouteSnapshot | null): string {
  if (latest.p95 !== null && previous && previous.p95 !== null) {
    return `P95 moved from ${formatDuration(previous.p95)} to ${formatDuration(latest.p95)} in the selected manifest.`;
  }
  if (latest.samples) {
    return `${latest.samples.toLocaleString('en')} timeline samples in the selected manifest.`;
  }
  return 'Waiting for timeline samples from the selected manifest.';
}

function getDistributionHeadline(
  latest: RouteSnapshot,
  previous: RouteSnapshot | null,
  change: number | null
): string {
  if (!latest.samples) {
    return 'Waiting for route data.';
  }
  if (!previous || change === null) {
    return 'Collecting enough data to compare the long tail.';
  }
  if (change > 0) {
    return 'The long tail is moving later.';
  }
  if (change < 0) {
    return 'The long tail is moving earlier.';
  }
  return 'The long tail is stable.';
}

function formatNullableDuration(milliseconds: number | null): string {
  return milliseconds === null ? '—' : formatDuration(milliseconds);
}

function formatDuration(milliseconds: number): string {
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(2)} s`
    : `${Math.round(milliseconds)} ms`;
}

function formatChange(change: number | null): string {
  return change === null
    ? '—'
    : `${change > 0 ? '↑ ' : change < 0 ? '↓ ' : ''}${Math.abs(change)}%`;
}
