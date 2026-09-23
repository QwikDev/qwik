import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import Histogram, { latencyColors } from '~/components/histogram';
import { ManifestIcon } from '~/components/icons/manifest';
import PageHeader from '~/components/page-header';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getSlowEdges, type SlowEdge } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { BUCKETS, vectorAvg, vectorSum } from '~/stats/vector';

interface SlowSymbol {
  edges: SlowEdge[];
  manifestCount: number;
}

export const head: DocumentHead = {
  title: 'Slow Symbols | Qwik Insights',
};

export const useData = routeLoader$<SlowSymbol>(async ({ params, query }) => {
  const manifest = query.get('manifest');
  const db = getDB();
  const manifestHashes = manifest
    ? manifest.split(',').filter(Boolean).slice(0, 100)
    : await dbGetManifestHashes(db, params.publicApiKey);
  const edges = await getSlowEdges(db, params.publicApiKey, manifestHashes);
  return { edges, manifestCount: manifestHashes.length };
});

export default component$(() => {
  const data = useData();
  const samples = data.value.edges.reduce((total, edge) => total + vectorSum(edge.latency), 0);
  const symbolCount = new Set(data.value.edges.map((edge) => edge.to)).size;
  return (
    <div class="font-editorial-ui text-editorial-primary">
      <PageHeader
        eyebrow="Latency outliers"
        title="Slow symbols"
        description="Find symbols with the slowest execution latency across recorded manifests."
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

      {data.value.edges.length ? (
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
                  Avg.
                </th>
                <th scope="col" class="py-editorial-4 pl-editorial-6 font-semibold">
                  Latency distribution
                </th>
              </tr>
            </thead>
            <tbody>
              {data.value.edges.map((edge) => (
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
                    <SymbolTile symbol={edge.to} />
                  </td>
                  <td class="py-editorial-5 text-right font-semibold">
                    {vectorSum(edge.latency).toLocaleString('en')}
                  </td>
                  <td class="py-editorial-5 text-right font-semibold">
                    {Math.round(vectorAvg(edge.latency))} ms
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
          <h2 class="text-editorial-24 font-semibold">No slow symbols yet</h2>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            Slow symbols will appear after latency samples are recorded.
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
