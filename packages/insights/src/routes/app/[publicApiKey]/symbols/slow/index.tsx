import SymbolFilter from '~/components/symbol-filter';
import { filterSymbols } from '~/stats/symbol-search';
import { loadReportScope } from '~/db/report-scope';
import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { getManifestPerformance } from '../../performance';
import Histogram, { latencyColors } from '~/components/histogram';
import { ManifestIcon } from '~/components/icons/manifest';
import PageHeader from '~/components/page-header';
import ResultsPagination from '~/components/results-pagination';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getSlowEdges, getSymbolDetails, type SlowEdge } from '~/db/query';
import { BUCKETS, vectorSum } from '~/stats/vector';
import { paginateResults, type ResultsPage } from '~/stats/pagination';

interface SlowSymbol extends ResultsPage<
  SlowEdge & ReturnType<typeof getManifestPerformance> & { fullName?: string; origin?: string }
> {
  manifestCount: number;
  samples: number;
  symbolCount: number;
}

export const head: DocumentHead = {
  title: 'Slow Symbols | Qwik Insights',
};

export const useData = routeLoader$<SlowSymbol>(async ({ params, query }) => {
  const db = getDB();
  const { selectedHash } = await loadReportScope(db, params.publicApiKey, query);
  const manifestHashes = selectedHash ? [selectedHash] : [];
  const [edges, metadata] = await Promise.all([
    getSlowEdges(db, params.publicApiKey, manifestHashes),
    selectedHash ? getSymbolDetails(db, params.publicApiKey, { manifestHashes }) : [],
  ]);
  const details = new Map(metadata.map((symbol) => [symbol.hash, symbol]));
  return {
    ...paginateResults(
      filterSymbols(
        edges.map((edge) => ({
          ...edge,
          hash: edge.to,
          fullName: details.get(edge.to)?.fullName,
          origin: details.get(edge.to)?.origin,
          ...getManifestPerformance(edge.latency),
        })),
        query.get('q'),
        query.get('sort') ?? 'p95'
      ),
      query.get('page')
    ),
    manifestCount: manifestHashes.length,
    samples: edges.reduce((total, edge) => total + vectorSum(edge.latency), 0),
    symbolCount: new Set(edges.map((edge) => edge.to)).size,
  };
});

export default component$(() => {
  const data = useData();
  const { samples, symbolCount } = data.value;
  return (
    <div class="font-editorial-ui text-editorial-primary">
      <PageHeader
        report="slow"
        eyebrow="Latency outliers"
        title="Slow symbols"
        description="Find symbols with the slowest loading latency in the selected build."
      />

      <dl class="mt-editorial-6 flex flex-wrap items-baseline gap-x-editorial-14 gap-y-editorial-3 border-b border-editorial-border pb-editorial-3">
        <SummaryMetric
          value={symbolCount.toLocaleString('en')}
          label={symbolCount === 1 ? 'slow symbol' : 'slow symbols'}
        />
        <SummaryMetric value={samples.toLocaleString('en')} label="samples" />
        <SummaryMetric
          value={data.value.manifestCount.toLocaleString('en')}
          label={data.value.manifestCount === 1 ? 'manifest' : 'manifests'}
        />
      </dl>

      <SymbolFilter defaultSort="p95" />
      <ResultsPagination page={data.value.page} pageCount={data.value.pageCount} />

      {data.value.items.length ? (
        <div class="overflow-x-auto">
          <table class="w-full min-w-[1032px] text-left text-editorial-12">
            <thead class="border-b border-editorial-border text-editorial-11 tracking-[0.04em] text-editorial-muted uppercase">
              <tr>
                <th scope="col" class="w-40 py-editorial-4 font-semibold">
                  Manifest
                </th>
                <th scope="col" class="w-44 py-editorial-4 font-semibold">
                  Symbol
                </th>
                <th scope="col" class="w-24 py-editorial-4 text-right font-semibold">
                  Count
                </th>
                <th scope="col" class="w-24 py-editorial-4 text-right font-semibold">
                  P95
                </th>
                <th scope="col" class="py-editorial-4 pl-editorial-6 font-semibold">
                  Latency distribution
                </th>
              </tr>
            </thead>
            <tbody>
              {data.value.items.map((edge) => (
                <tr
                  key={`${edge.manifestHash}:${edge.to}`}
                  class="border-b border-editorial-border align-middle"
                >
                  <th scope="row" class="py-editorial-5 font-normal">
                    <code
                      class="inline-flex items-center gap-editorial-3 font-editorial-mono font-semibold"
                      title={edge.manifestHash}
                    >
                      <span class="inline-flex size-5 items-center justify-center border border-editorial-border-strong text-editorial-secondary">
                        <ManifestIcon class="size-3.5" />
                      </span>
                      {edge.manifestHash.slice(0, 8)}
                    </code>
                  </th>
                  <td class="py-editorial-5 font-editorial-mono font-semibold">
                    <SymbolTile symbol={edge.to} fullName={edge.fullName} origin={edge.origin} />
                  </td>
                  <td class="py-editorial-5 text-right font-semibold">
                    {vectorSum(edge.latency).toLocaleString('en')}
                  </td>
                  <td class="py-editorial-5 text-right font-semibold">
                    {edge.p95 === null ? 'Collecting data' : `${Math.round(edge.p95)} ms`}
                  </td>
                  <td class="py-editorial-5 pl-editorial-6">
                    <Histogram vector={edge.latency} colors={latencyColors} buckets={BUCKETS} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section class="border-b border-editorial-border py-editorial-16">
          <h2 class="text-editorial-24 font-semibold">No matching slow symbols</h2>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            Clear the search, choose another build, or collect loading latency observations.
          </p>
        </section>
      )}
    </div>
  );
});

const SummaryMetric = component$<{ label: string; value: string }>(({ label, value }) => (
  <div class="flex items-baseline gap-editorial-2">
    <dt class="order-2 text-editorial-14 text-editorial-secondary">{label}</dt>
    <dd class="order-1 text-editorial-24 font-semibold">{value}</dd>
  </div>
));
