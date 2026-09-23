import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, useLocation, type DocumentHead } from '@qwik.dev/router';
import { and, count, desc, eq, gte, max } from 'drizzle-orm';
import { ButtonLink } from '~/components/button';
import Histogram, { currentColors, previousColors } from '~/components/histogram';
import { errorTable, getDB } from '~/db';
import { getAppInfo, getSlowEdges, getSymbolDetails } from '~/db/query';
import { dbGetManifestStats } from '~/db/sql-manifest';
import { getRoutes } from '~/db/sql-routes';
import { BUCKETS, vectorPercentile, vectorSum } from '~/stats/vector';
import {
  getManifestPerformance,
  MIN_PERFORMANCE_SAMPLES,
  PERFORMANCE_PERCENTILE,
} from './performance';

export const head: DocumentHead = {
  title: 'Performance overview | Qwik Insights',
};

export const useAppData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const [app, manifests] = await Promise.all([
    getAppInfo(db, publicApiKey),
    dbGetManifestStats(db, publicApiKey, { limit: 2 }),
  ]);
  const manifestHashes = manifests.map((manifest) => manifest.hash);
  const latestHash = manifestHashes.at(0);
  const previousHash = manifestHashes.at(1);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [latestEdges, previousEdges, symbolDetails, routes, errors] = await Promise.all([
    getSlowEdges(db, publicApiKey, latestHash ? [latestHash] : []),
    getSlowEdges(db, publicApiKey, previousHash ? [previousHash] : []),
    manifestHashes.length ? getSymbolDetails(db, publicApiKey, { manifestHashes }) : [],
    latestHash ? getRoutes(db, publicApiKey, [latestHash]) : [],
    db
      .select({
        message: errorTable.message,
        latest: max(errorTable.timestamp),
        count: count(),
      })
      .from(errorTable)
      .where(and(eq(errorTable.publicApiKey, publicApiKey), gte(errorTable.timestamp, dayAgo)))
      .groupBy(errorTable.message)
      .orderBy(desc(max(errorTable.timestamp)))
      .limit(3)
      .all(),
  ]);
  const names = new Map(symbolDetails.map((symbol) => [symbol.hash, symbol.fullName]));
  const previousEdgesBySymbol = new Map(previousEdges.map((edge) => [edge.to, edge]));
  const symbolRoutes = new Map<string, Set<string>>();
  for (const route of routes) {
    let routeNames = symbolRoutes.get(route.symbol);
    if (!routeNames) {
      routeNames = new Set();
      symbolRoutes.set(route.symbol, routeNames);
    }
    routeNames.add(route.route);
  }
  const slowSymbols = latestEdges
    .map((edge) => {
      const latency = vectorPercentile(edge.latency, PERFORMANCE_PERCENTILE);
      const previousLatency = vectorPercentile(
        previousEdgesBySymbol.get(edge.to)?.latency ?? [],
        PERFORMANCE_PERCENTILE
      );
      return {
        hash: edge.to,
        name: names.get(edge.to) ?? edge.to,
        routes: Array.from(symbolRoutes.get(edge.to) ?? []).slice(0, 2),
        latency,
        change: previousLatency
          ? Math.round(((latency - previousLatency) / previousLatency) * 100)
          : null,
        samples: vectorSum(edge.latency),
      };
    })
    .sort((a, b) => b.latency - a.latency)
    .slice(0, 3);
  const latest = manifests.at(0);
  const previous = manifests.at(1);
  const latestPerformance = latest ? getManifestPerformance(latest.latency) : null;
  const previousPerformance = previous ? getManifestPerformance(previous.latency) : null;
  const latestLatency = latestPerformance?.p95 ?? null;
  const previousLatency = previousPerformance?.p95 ?? null;

  return {
    app,
    latest: latest
      ? {
          hash: latest.hash,
          timestamp: latest.timestamp.toISOString(),
          latency: latest.latency,
          p95: latestLatency,
          samples: latestPerformance?.samples ?? 0,
        }
      : null,
    previous: previous
      ? {
          hash: previous.hash,
          timestamp: previous.timestamp.toISOString(),
          latency: previous.latency,
          p95: previousLatency,
          samples: previousPerformance?.samples ?? 0,
        }
      : null,
    change:
      latestLatency !== null && previousLatency !== null && previousLatency > 0
        ? Math.round(((latestLatency - previousLatency) / previousLatency) * 100)
        : null,
    slowSymbols,
    errors: errors.map((error) => ({
      message: error.message,
      latest: error.latest?.toISOString() ?? '',
      count: error.count,
    })),
  };
});

export default component$(() => {
  const data = useAppData();
  const location = useLocation();
  const appPath = `/app/${location.params.publicApiKey}/`;
  const { latest, previous, change } = data.value;
  const isRegression = change !== null && change > 0;
  const isImprovement = change !== null && change < 0;
  const status = !latest
    ? 'No performance data'
    : !previous
      ? 'Baseline collecting'
      : change === null
        ? 'Collecting comparison data'
        : isRegression
          ? 'Regression detected'
          : isImprovement
            ? 'Performance improved'
            : 'Performance stable';
  const headline = !latest
    ? 'Waiting for symbol data'
    : previous && change !== null
      ? change === 0
        ? 'Symbol loading is unchanged'
        : `Symbol loading is ${Math.abs(change)}% ${isRegression ? 'slower' : 'faster'}`
      : previous
        ? 'Collecting enough data to compare'
        : 'The latest manifest is collecting samples';

  return (
    <div class="font-editorial-ui text-editorial-primary">
      <header class="flex flex-col gap-editorial-4 border-b border-editorial-border pb-editorial-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
            Performance overview
          </p>
          <h1 class="mt-editorial-2 text-editorial-36 font-bold leading-[1.2] tracking-[-0.03em]">
            {data.value.app.name}
          </h1>
        </div>
        <div class="text-left md:text-right">
          <p class="text-editorial-12 font-semibold">Latest vs previous manifest</p>
          <p class="mt-editorial-1 font-editorial-mono text-editorial-11 text-editorial-muted">
            {latest?.hash ?? 'Waiting for data'}
            {previous && ` / ${previous.hash}`}
          </p>
        </div>
      </header>

      <section class="mt-editorial-12 grid min-w-0 gap-editorial-10 border-b border-editorial-border pb-editorial-10 lg:grid-cols-[minmax(0,1fr)_296px]">
        <div class="min-w-0">
          <section
            class={[
              'border-l-4 pl-editorial-6',
              isRegression
                ? 'border-editorial-danger'
                : isImprovement
                  ? 'border-editorial-success'
                  : 'border-editorial-accent',
            ]}
            aria-labelledby="performance-headline"
          >
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
              id="performance-headline"
              class="mt-editorial-3 text-editorial-44 font-bold leading-[1.2] tracking-[-0.03em]"
            >
              {headline}
            </h2>
            <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
              {previous && change !== null
                ? `Manifest ${latest?.hash} compared with ${previous.hash}.`
                : previous
                  ? `Comparison starts at ${MIN_PERFORMANCE_SAMPLES} samples per manifest. Current: ${latest?.samples ?? 0}; previous: ${previous.samples}.`
                  : 'A previous manifest is required before a comparison can be calculated.'}
            </p>
            <ButtonLink
              href={`${appPath}symbols/slow/${latest ? `?manifest=${encodeURIComponent(latest.hash)}` : ''}`}
              theme="primary"
              class="mt-editorial-5"
            >
              Inspect slow symbols
            </ButtonLink>
          </section>

          <section class="mt-editorial-12">
            <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
              Symbol load latency · P95
            </p>
            <h2 class="mt-editorial-2 text-editorial-24 font-semibold tracking-[-0.02em]">
              Latency distribution by manifest
            </h2>
            {latest ? (
              <div class="mt-editorial-8 grid gap-editorial-8 xl:grid-cols-2">
                <Distribution
                  label="Latest manifest"
                  tone="current"
                  value={latest.p95}
                  vector={latest.latency}
                />
                {previous ? (
                  <Distribution
                    label="Previous manifest"
                    tone="previous"
                    value={previous.p95}
                    vector={previous.latency}
                  />
                ) : (
                  <EmptyDistribution />
                )}
              </div>
            ) : (
              <p class="mt-editorial-8 text-editorial-14 text-editorial-secondary">
                Performance data will appear after the first production symbols are recorded.
              </p>
            )}
          </section>
        </div>

        <aside class="border-t border-editorial-border pt-editorial-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-editorial-8">
          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
            What the data says
          </p>
          <p class="mt-editorial-3 text-editorial-20 font-semibold leading-[1.35]">
            {latest?.p95 === null
              ? `P95 becomes available after ${MIN_PERFORMANCE_SAMPLES} samples. Current: ${latest.samples}.`
              : latest && previous?.p95 === null
                ? `Comparison begins after both manifests reach ${MIN_PERFORMANCE_SAMPLES} samples.`
                : latest
                  ? `95% of recorded symbol loads completed within ${formatDuration(latest.p95)}.`
                  : 'No symbol samples have been recorded yet.'}
          </p>
          <dl class="mt-editorial-6">
            <Metric
              label="Current P95"
              value={latest && latest.p95 !== null ? formatDuration(latest.p95) : '—'}
            />
            <Metric
              label="Previous P95"
              value={previous && previous.p95 !== null ? formatDuration(previous.p95) : '—'}
            />
            <Metric
              label="Change"
              value={change === null ? '—' : `${change > 0 ? '+' : ''}${change}%`}
              tone={isRegression ? 'danger' : isImprovement ? 'success' : undefined}
            />
            <Metric label="Samples" value={latest?.samples.toLocaleString('en') ?? '—'} />
          </dl>
          {latest && (
            <div class="mt-editorial-6 grid gap-editorial-4 text-editorial-12">
              <div>
                <p class="font-semibold tracking-[0.04em] text-editorial-muted uppercase">
                  Manifest
                </p>
                <code class="mt-editorial-2 inline-block rounded-editorial-sm border border-editorial-border px-editorial-3 py-editorial-2">
                  {latest.hash}
                </code>
              </div>
              <div>
                <p class="font-semibold tracking-[0.04em] text-editorial-muted uppercase">
                  First seen
                </p>
                <time class="mt-editorial-2 block" dateTime={latest.timestamp}>
                  {formatDate(latest.timestamp)}
                </time>
              </div>
            </div>
          )}
        </aside>
      </section>

      <div class="grid gap-editorial-10 pt-editorial-8 xl:grid-cols-[1.2fr_1fr]">
        <section class="min-w-0" aria-labelledby="slow-symbols-title">
          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
            What changed
          </p>
          <div class="mt-editorial-2 flex items-center justify-between gap-editorial-4">
            <h2 id="slow-symbols-title" class="text-editorial-24 font-semibold tracking-[-0.02em]">
              Slow symbols
            </h2>
            <Link
              class="text-editorial-12 font-semibold text-editorial-link"
              href={`${appPath}symbols/slow/`}
            >
              View all
            </Link>
          </div>
          {data.value.slowSymbols.length ? (
            <div class="mt-editorial-4 overflow-x-auto">
              <table class="w-full min-w-[620px] text-left text-editorial-12">
                <thead class="border-b border-editorial-border text-editorial-11 tracking-[0.04em] text-editorial-muted uppercase">
                  <tr>
                    <th class="py-editorial-3 font-semibold">Symbol</th>
                    <th class="py-editorial-3 font-semibold">Routes</th>
                    <th class="py-editorial-3 font-semibold">P95</th>
                    <th class="py-editorial-3 font-semibold">Change</th>
                    <th class="py-editorial-3 text-right font-semibold">Samples</th>
                  </tr>
                </thead>
                <tbody>
                  {data.value.slowSymbols.map((symbol) => (
                    <tr key={symbol.hash} class="border-b border-editorial-border">
                      <td class="max-w-48 truncate py-editorial-3 font-editorial-mono font-semibold text-editorial-link">
                        {symbol.name}
                      </td>
                      <td class="max-w-48 truncate py-editorial-3 text-editorial-secondary">
                        {symbol.routes.join(', ') || '—'}
                      </td>
                      <td class="py-editorial-3 font-semibold">{formatDuration(symbol.latency)}</td>
                      <td
                        class={[
                          'py-editorial-3 font-semibold',
                          symbol.change !== null && symbol.change > 0 && 'text-editorial-danger',
                          symbol.change !== null && symbol.change < 0 && 'text-editorial-success',
                        ]}
                      >
                        {symbol.change === null
                          ? '—'
                          : `${symbol.change > 0 ? '+' : ''}${symbol.change}%`}
                      </td>
                      <td class="py-editorial-3 text-right text-editorial-secondary">
                        {symbol.samples.toLocaleString('en')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p class="mt-editorial-6 text-editorial-14 text-editorial-secondary">
              No symbol samples are available for the latest manifest.
            </p>
          )}
        </section>

        <section class="min-w-0" aria-labelledby="recent-errors-title">
          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
            Last 24 hours
          </p>
          <div class="mt-editorial-2 flex items-center justify-between gap-editorial-4">
            <h2 id="recent-errors-title" class="text-editorial-24 font-semibold tracking-[-0.02em]">
              Recent error groups
            </h2>
            <Link
              class="text-editorial-12 font-semibold text-editorial-link"
              href={`${appPath}errors/`}
            >
              View all
            </Link>
          </div>
          {data.value.errors.length ? (
            <ol class="mt-editorial-4">
              {data.value.errors.map((error) => (
                <li
                  key={error.message}
                  class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-editorial-4 border-b border-editorial-border border-l-4 border-l-editorial-danger py-editorial-3 pl-editorial-3"
                >
                  <span class="truncate text-editorial-12 font-semibold">{error.message}</span>
                  <time
                    class="text-editorial-11 text-editorial-muted"
                    dateTime={error.latest}
                    title={formatDate(error.latest)}
                  >
                    {formatTime(error.latest)}
                  </time>
                  <span class="min-w-8 text-right text-editorial-12 font-semibold text-editorial-danger">
                    {error.count}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p class="mt-editorial-6 text-editorial-14 text-editorial-secondary">
              No errors recorded in the last 24 hours.
            </p>
          )}
        </section>
      </div>
    </div>
  );
});

const Distribution = component$<{
  label: string;
  tone: 'current' | 'previous';
  value: number | null;
  vector: number[];
}>(({ label, tone, value, vector }) => {
  const colors = tone === 'current' ? currentColors : previousColors;
  return (
    <div class="min-w-0">
      <div class="flex items-center justify-between gap-editorial-4">
        <div class="flex items-center gap-editorial-2">
          <span
            class={[
              'h-1 w-6',
              tone === 'current' ? 'bg-editorial-data-current' : 'bg-editorial-data-previous',
            ]}
            aria-hidden="true"
          />
          <span class="text-editorial-12 text-editorial-secondary">{label}</span>
        </div>
        <strong class="text-editorial-14">
          {value === null ? 'Collecting data' : formatDuration(value)}
        </strong>
      </div>
      <div class="mt-editorial-4 overflow-x-auto">
        <Histogram vector={vector} colors={colors} buckets={BUCKETS} />
      </div>
    </div>
  );
});

const EmptyDistribution = component$(() => (
  <div class="flex min-h-32 items-center border-t border-editorial-border text-editorial-12 text-editorial-secondary">
    Previous manifest data is not available yet.
  </div>
));

const Metric = component$<{
  label: string;
  tone?: 'danger' | 'success';
  value: string;
}>(({ label, tone, value }) => (
  <div class="flex items-center justify-between border-t border-editorial-border py-editorial-4">
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

function formatDuration(milliseconds: number): string {
  return milliseconds >= 1000
    ? `${(milliseconds / 1000).toFixed(1)} s`
    : `${milliseconds.toFixed(1)} ms`;
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
