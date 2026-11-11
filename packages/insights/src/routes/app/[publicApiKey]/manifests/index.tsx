import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, useLocation, type DocumentHead } from '@qwik.dev/router';
import { getManifestPerformance } from '../performance';
import Histogram, { latencyColors } from '~/components/histogram';
import { ManifestIcon } from '~/components/icons/manifest';
import PageHeader from '~/components/page-header';
import ResultsPagination from '~/components/results-pagination';
import { getDB } from '~/db';
import { dbGetManifestStats } from '~/db/sql-manifest';
import { BUCKETS, vectorSum } from '~/stats/vector';
import {
  formatManifestTimestamp,
  getManifestAverage,
  getManifestHistoryPage,
} from './manifest-history';

export const head: DocumentHead = {
  title: 'Manifests | Qwik Insights',
};

export const useData = routeLoader$(async ({ params, query }) => {
  const publicApiKey = params.publicApiKey;
  const db = getDB();
  const data = await dbGetManifestStats(db, publicApiKey);
  return getManifestHistoryPage(data, query.get('page'));
});

export default component$(() => {
  const data = useData();
  const location = useLocation();
  const overview = data.value.overview;
  return (
    <div class="font-editorial-ui text-editorial-primary">
      <PageHeader
        report="manifests"
        eyebrow="Manifest history"
        title="Manifests"
        description="Compare deployment fingerprints and spot latency shifts introduced by each build."
      />

      <dl class="mt-editorial-6 flex flex-wrap items-baseline gap-x-editorial-14 gap-y-editorial-3 border-b border-editorial-border pb-editorial-3">
        <SummaryMetric
          value={overview.manifests.toLocaleString('en')}
          label={overview.manifests === 1 ? 'manifest in range' : 'manifests in range'}
        />
        <SummaryMetric value={overview.samples.toLocaleString('en')} label="samples" />
        <SummaryMetric
          value={overview.medianLatency === null ? '—' : `${Math.round(overview.medianLatency)} ms`}
          label="median"
        />
      </dl>

      <ResultsPagination page={data.value.page} pageCount={data.value.pageCount} />

      {data.value.items.length ? (
        <div class="overflow-x-auto">
          <table class="w-full min-w-[1032px] text-left text-editorial-12">
            <thead class="border-b border-editorial-border text-editorial-11 tracking-[0.04em] text-editorial-muted uppercase">
              <tr>
                <th class="w-36 py-editorial-4 font-semibold">Manifest</th>
                <th class="w-48 py-editorial-4 font-semibold">Captured (UTC)</th>
                <th class="w-24 py-editorial-4 text-right font-semibold">Samples</th>
                <th class="w-24 py-editorial-4 text-right font-semibold">P95</th>
                <th class="w-24 py-editorial-4 text-right font-semibold">Avg.</th>
                <th class="py-editorial-4 pl-editorial-6 font-semibold">Latency distribution</th>
              </tr>
            </thead>
            <tbody>
              {data.value.items.map((row) => {
                const average = getManifestAverage(row.latency);
                const status = row.status;
                const performance = getManifestPerformance(row.latency);
                return (
                  <tr key={row.hash} class="border-b border-editorial-border align-middle">
                    <th class="py-editorial-5 font-normal">
                      <Link
                        href={`/app/${location.params.publicApiKey}/?manifest=${encodeURIComponent(row.hash)}`}
                        class="inline-flex items-center gap-editorial-3 font-editorial-mono font-semibold"
                        title={row.hash}
                      >
                        <span class="inline-flex size-5 items-center justify-center border border-editorial-border-strong text-editorial-secondary">
                          <ManifestIcon class="size-3.5" />
                        </span>
                        {row.hash.slice(0, 8)}
                      </Link>
                    </th>
                    <td class="py-editorial-5 text-editorial-secondary">
                      {formatManifestTimestamp(row.timestamp)}
                    </td>
                    <td class="py-editorial-5 text-right font-semibold">
                      {vectorSum(row.latency).toLocaleString('en')}
                    </td>
                    <td class="py-editorial-5 text-right font-semibold">
                      {performance.p95 === null
                        ? 'Collecting data'
                        : `${Math.round(performance.p95)} ms`}
                    </td>
                    <td class="py-editorial-5 text-right font-semibold">
                      {average === null ? '—' : `${Math.round(average)} ms`}
                    </td>
                    <td class="py-editorial-5 pl-editorial-6">
                      <div class="grid grid-cols-[minmax(24rem,1fr)_6rem] items-center gap-editorial-6">
                        <Histogram vector={row.latency} colors={latencyColors} buckets={BUCKETS} />
                        <span
                          class={[
                            'text-editorial-11 font-semibold tracking-[0.04em] uppercase',
                            status === 'Regression'
                              ? 'text-editorial-danger'
                              : status === 'Stable'
                                ? 'text-editorial-success'
                                : 'text-editorial-muted',
                          ]}
                        >
                          {status === 'Regression'
                            ? 'Higher P95'
                            : status === 'Stable'
                              ? 'Same or lower P95'
                              : status}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <section class="border-b border-editorial-border py-editorial-16">
          <h2 class="text-editorial-24 font-semibold">No manifests yet</h2>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            Manifest history will appear after the first deployment records symbol executions.
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
