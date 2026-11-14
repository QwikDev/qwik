import { loadReportScope } from '~/db/report-scope';
import SymbolFilter from '~/components/symbol-filter';
import { filterSymbols } from '~/stats/symbol-search';
import { getManifestPerformance } from '../performance';
import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import Histogram, { delayColors, latencyColors } from '~/components/histogram';
import PageHeader from '~/components/page-header';
import ResultsPagination from '~/components/results-pagination';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getEdges, getSymbolDetails } from '~/db/query';
import { BUCKETS, vectorAdd, vectorNew, vectorSum } from '~/stats/vector';
import { paginateResults, type ResultsPage } from '~/stats/pagination';

interface SymbolStats {
  hash: string;
  delay: number[];
  latency: number[];
  fullName?: string;
  origin?: string;
  samples: number;
  p95: number | null;
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
  const metadata = selectedHash
    ? await getSymbolDetails(db, params.publicApiKey, { manifestHashes: pageManifestHashes })
    : [];
  const details = new Map(metadata.map((symbol) => [symbol.hash, symbol]));
  const symbols = Array.from(symbolMap.values()).map((symbol) => ({
    ...symbol,
    fullName: details.get(symbol.hash)?.fullName,
    origin: details.get(symbol.hash)?.origin,
    ...getManifestPerformance(symbol.latency),
  }));
  return {
    symbols: paginateResults(
      filterSymbols(symbols, url.searchParams.get('q'), url.searchParams.get('sort')),
      url.searchParams.get('symbolPage')
    ),
    samples: symbols.reduce((total, symbol) => total + vectorSum(symbol.latency), 0),
    manifestCount: pageManifestHashes.length,
  };
  ////////////////////////////////////////////////////////
  function getSymbol(name: string) {
    let symbol = symbolMap.get(name);
    if (!symbol) {
      symbol = {
        hash: name,
        samples: 0,
        p95: null,
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

      <SymbolFilter />
      <ResultsPagination
        page={data.value.symbols.page}
        pageCount={data.value.symbols.pageCount}
        parameter="symbolPage"
      />

      {data.value.symbols.items.length ? (
        <div class="overflow-x-auto">
          <table class="w-full text-left text-editorial-12">
            <thead class="border-b border-editorial-border text-editorial-11 text-editorial-muted uppercase">
              <tr>
                <th class="py-editorial-4">Symbol / source</th>
                <th class="p-editorial-4 text-right">Samples</th>
                <th class="p-editorial-4 text-right">P95 loading latency</th>
              </tr>
            </thead>
            <tbody>
              {data.value.symbols.items.map((symbol) => (
                <tr key={symbol.hash} class="border-b border-editorial-border align-top">
                  <th scope="row" class="py-editorial-4 font-normal">
                    <SymbolTile
                      symbol={symbol.hash}
                      fullName={symbol.fullName}
                      origin={symbol.origin}
                    />
                    {symbol.origin && (
                      <p class="mt-editorial-1 break-all text-editorial-11 text-editorial-muted">
                        {symbol.origin}
                      </p>
                    )}
                    <details class="mt-editorial-3">
                      <summary class="cursor-pointer text-editorial-11 text-editorial-secondary">
                        Show distributions
                      </summary>
                      <div class="mt-editorial-3 grid gap-editorial-4 lg:grid-cols-2">
                        <div>
                          <p>Request gap</p>
                          <Histogram vector={symbol.delay} buckets={BUCKETS} colors={delayColors} />
                        </div>
                        <div>
                          <p>Loading latency</p>
                          <Histogram
                            vector={symbol.latency}
                            colors={latencyColors}
                            buckets={BUCKETS}
                          />
                        </div>
                      </div>
                    </details>
                  </th>
                  <td class="p-editorial-4 text-right">{symbol.samples.toLocaleString('en')}</td>
                  <td class="p-editorial-4 text-right">
                    {symbol.p95 === null ? 'Collecting data' : `${Math.round(symbol.p95)} ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <section class="border-b border-editorial-border py-editorial-16">
          <h2 class="text-editorial-24 font-semibold">No matching symbols</h2>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            Clear the search, choose another build, or collect symbol observations.
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
