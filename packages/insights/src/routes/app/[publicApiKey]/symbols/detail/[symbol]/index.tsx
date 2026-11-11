import { useReportQuery } from '~/components/report-scope/use-report-query';
import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, useLocation, type DocumentHead } from '@qwik.dev/router';
import Histogram, { currentColors, previousColors } from '~/components/histogram';
import PageHeader from '~/components/page-header';
import { SymbolSource } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { loadReportScope } from '~/db/report-scope';
import { getSymbolOverview } from '~/db/symbol-overview';
import { getReportHref } from '~/report-scope';
import { BUCKETS } from '~/stats/vector';
import { getRouteDetailsHref } from '../../../routes/route-url';

export const head: DocumentHead = { title: 'Symbol details | Qwik Insights' };

export const useSymbolOverview = routeLoader$(async ({ params, query }) => {
  const { selectedHash, previousHash } = await loadReportScope(getDB(), params.publicApiKey, query);
  return {
    ...(await getSymbolOverview(
      getDB(),
      params.publicApiKey,
      params.symbol,
      selectedHash,
      previousHash
    )),
    selectedHash,
    previousHash,
  };
});

export default component$(() => {
  const overview = useSymbolOverview().value;
  const location = useLocation();
  const reportQuery = useReportQuery();
  const comparison = overview.comparison;
  return (
    <div>
      <PageHeader
        report="symbol"
        eyebrow="Symbol investigation"
        title={overview.metadata?.fullName ?? location.params.symbol}
        description={overview.metadata?.origin ?? 'Source metadata is unavailable for this build.'}
      />
      <dl class="my-editorial-6 grid gap-editorial-5 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Selected P95"
          value={comparison.p95 === null ? 'Collecting data' : `${Math.round(comparison.p95)} ms`}
        />
        <Metric
          label="Baseline P95"
          value={
            !overview.previousHash
              ? 'No baseline selected'
              : comparison.previousP95 === null
                ? 'Collecting data'
                : `${Math.round(comparison.previousP95)} ms`
          }
        />
        <Metric
          label={overview.previousHash ? 'Samples / baseline' : 'Samples'}
          value={
            overview.previousHash
              ? `${comparison.samples} / ${comparison.previousSamples}`
              : String(comparison.samples)
          }
        />
        <Metric
          label="Observed change"
          value={
            !overview.previousHash
              ? 'Choose a baseline to compare'
              : comparison.change === null
                ? 'Needs 100 samples in both builds'
                : `${comparison.change > 0 ? '+' : ''}${comparison.change}%`
          }
        />
      </dl>
      <p class="mb-editorial-4 text-editorial-12 text-editorial-secondary">
        Loading latency measures request to delivery. Differences are descriptive, and percentiles
        are estimated from histogram buckets.
      </p>
      <Histogram
        vector={overview.current}
        colors={currentColors}
        buckets={BUCKETS}
        seriesLabel="Selected build"
        comparison={
          overview.previousHash
            ? { vector: overview.previous, colors: previousColors, label: 'Baseline' }
            : undefined
        }
      />
      <section class="my-editorial-8">
        <h2 class="text-editorial-20 font-semibold">Observed routes</h2>
        <p class="mt-editorial-2 text-editorial-12 text-editorial-secondary">
          Up to 100 routes in the selected build.
        </p>
        <ul class="mt-editorial-4 flex flex-wrap gap-editorial-4">
          {overview.routes.map((route) => (
            <li key={route}>
              <Link
                class="font-editorial-mono text-editorial-link"
                href={getReportHref(
                  getRouteDetailsHref(location.params.publicApiKey, route),
                  reportQuery
                )}
              >
                {route}
              </Link>
            </li>
          ))}
        </ul>
        {!overview.routes.length && (
          <p class="mt-editorial-4">No route samples recorded for this symbol.</p>
        )}
        <div class="mt-editorial-5 flex gap-editorial-5 text-editorial-12 font-semibold text-editorial-link">
          <Link
            href={getReportHref(`/app/${location.params.publicApiKey}/symbols/edge/`, reportQuery)}
          >
            Inspect execution paths →
          </Link>
          <Link
            href={getReportHref(
              `/app/${location.params.publicApiKey}/symbols/bundles/`,
              reportQuery
            )}
          >
            Inspect bundle relationships →
          </Link>
        </div>
      </section>
      {overview.selectedHash && (
        <section class="border border-editorial-border bg-editorial-surface">
          <SymbolSource
            key={`${overview.selectedHash}:${location.params.symbol}`}
            symbolHash={location.params.symbol}
            manifestHash={overview.selectedHash}
            fullName={overview.metadata?.fullName}
            origin={overview.metadata?.origin}
          />
        </section>
      )}
    </div>
  );
});

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt class="text-editorial-11 uppercase text-editorial-muted">{label}</dt>
      <dd class="mt-editorial-2 font-semibold">{value}</dd>
    </div>
  );
}
