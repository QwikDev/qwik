import { loadReportScope } from '~/db/report-scope';
import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import Histogram, { delayColors, latencyColors } from '~/components/histogram';
import PageHeader from '~/components/page-header';
import ResultsPagination from '~/components/results-pagination';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getEdges } from '~/db/query';
import { BUCKETS, vectorAdd, vectorNew, vectorSum } from '~/stats/vector';
import { paginateResults, type ResultsPage } from '~/stats/pagination';

interface SymbolStats {
  hash: string;
  delay: number[];
  latency: number[];
}

interface SymbolsInfo {
  symbols: ResultsPage<SymbolStats>;
  samples: number;
  manifestCount: number;
}

export const head: DocumentHead = {
  title: 'Symbols | Qwik Insights',
};

export const useData = routeLoader$<SymbolsInfo>(async ({ params, url }) => {
  const db = getDB();
  const { selectedHash } = await loadReportScope(db, params.publicApiKey, url.searchParams);
  const pageManifestHashes = selectedHash ? [selectedHash] : [];
  const edges = pageManifestHashes.length
    ? await getEdges(db, params.publicApiKey, { manifestHashes: pageManifestHashes })
    : [];

  const symbolMap = new Map<string, SymbolStats>();
  edges.forEach((edge) => {
    const symbol = getSymbol(edge.to);
    vectorAdd(symbol.delay, edge.delay);
    vectorAdd(symbol.latency, edge.latency);
  });
  const symbols = Array.from(symbolMap.values());
  return {
    symbols: paginateResults(symbols, url.searchParams.get('symbolPage')),
    samples: symbols.reduce((total, symbol) => total + vectorSum(symbol.latency), 0),
    manifestCount: pageManifestHashes.length,
  };
  ////////////////////////////////////////////////////////
  function getSymbol(name: string) {
    let symbol = symbolMap.get(name);
    if (!symbol) {
      symbol = {
        hash: name,
        delay: vectorNew(),
        latency: vectorNew(),
      };
      symbolMap.set(name, symbol);
    }
    return symbol;
  }
});

export default component$(() => {
  const data = useData();
  return (
    <div class="font-editorial-ui text-editorial-primary">
      <PageHeader
        report="symbols"
        eyebrow="Symbol performance"
        title="Symbols"
        description="Compare request gaps and loading latency across recorded symbols."
      />

      <dl class="mt-editorial-6 flex flex-wrap items-baseline gap-x-editorial-14 gap-y-editorial-3 border-b border-editorial-border pb-editorial-3">
        <SummaryMetric
          value={data.value.symbols.total.toLocaleString('en')}
          label={data.value.symbols.total === 1 ? 'symbol in range' : 'symbols in range'}
        />
        <SummaryMetric value={data.value.samples.toLocaleString('en')} label="samples" />
        <SummaryMetric
          value={data.value.manifestCount.toLocaleString('en')}
          label={data.value.manifestCount === 1 ? 'manifest' : 'manifests'}
        />
      </dl>

      <ResultsPagination
        page={data.value.symbols.page}
        pageCount={data.value.symbols.pageCount}
        parameter="symbolPage"
      />

      {data.value.symbols.items.length ? (
        <div class="overflow-x-auto">
          <table class="w-full min-w-[1032px] text-left text-editorial-12">
            <thead class="border-b border-editorial-border text-editorial-11 tracking-[0.04em] text-editorial-muted uppercase">
              <tr>
                <th scope="col" class="w-[42%] py-editorial-4 pr-editorial-6 font-semibold">
                  Delay distribution
                </th>
                <th scope="col" class="w-[42%] py-editorial-4 pr-editorial-6 font-semibold">
                  Latency distribution
                </th>
                <th scope="col" class="py-editorial-4 font-semibold">
                  Symbol
                </th>
              </tr>
            </thead>
            <tbody>
              {data.value.symbols.items.map((symbol) => (
                <tr key={symbol.hash} class="border-b border-editorial-border align-middle">
                  <td class="py-editorial-5 pr-editorial-6">
                    <Histogram vector={symbol.delay} buckets={BUCKETS} colors={delayColors} />
                  </td>
                  <td class="py-editorial-5 pr-editorial-6">
                    <Histogram vector={symbol.latency} colors={latencyColors} buckets={BUCKETS} />
                  </td>
                  <th scope="row" class="py-editorial-5 font-editorial-mono font-normal">
                    <SymbolTile symbol={symbol.hash} />
                  </th>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section class="border-b border-editorial-border py-editorial-16">
          <h2 class="text-editorial-24 font-semibold">No symbols yet</h2>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            Symbols will appear after the first execution data is recorded.
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
