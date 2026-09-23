import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import Button, { ButtonLink } from '~/components/button';
import Histogram, { delayColors, latencyColors } from '~/components/histogram';
import PageHeader from '~/components/page-header';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getEdges } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { BUCKETS, vectorAdd, vectorNew, vectorSum } from '~/stats/vector';

interface SymbolStats {
  hash: string;
  delay: number[];
  latency: number[];
}

interface SymbolsInfo {
  symbols: SymbolStats[];
  manifestCount: number;
  page: number;
  hasNext: boolean;
}

export const head: DocumentHead = {
  title: 'Symbols | Qwik Insights',
};

export const useData = routeLoader$<SymbolsInfo>(async ({ params, url }) => {
  const db = getDB();
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '', 10) || 1);
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!)
    : undefined;
  const manifestHashes = await dbGetManifestHashes(db, params.publicApiKey, {
    limit: 101,
    offset: (page - 1) * 100,
  });
  const hasNext = manifestHashes.length > 100;
  const pageManifestHashes = manifestHashes.slice(0, 100);
  const edges = pageManifestHashes.length
    ? await getEdges(db, params.publicApiKey, { limit, manifestHashes: pageManifestHashes })
    : [];

  const symbolMap = new Map<string, SymbolStats>();
  edges.forEach((edge) => {
    const symbol = getSymbol(edge.to);
    vectorAdd(symbol.delay, edge.delay);
    vectorAdd(symbol.latency, edge.latency);
  });
  return {
    symbols: Array.from(symbolMap.values()),
    manifestCount: pageManifestHashes.length,
    page,
    hasNext,
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
  const samples = data.value.symbols.reduce(
    (total, symbol) => total + vectorSum(symbol.latency),
    0
  );
  return (
    <div class="font-editorial-ui text-editorial-primary">
      <PageHeader
        eyebrow="Symbol performance"
        title="Symbols"
        description="Compare execution delay and latency distributions across recorded symbols."
      >
        <Pagination page={data.value.page} hasNext={data.value.hasNext} />
      </PageHeader>

      <dl class="mt-editorial-6 flex flex-wrap items-baseline gap-x-editorial-14 gap-y-editorial-3 border-b border-editorial-border pb-editorial-3">
        <SummaryMetric
          value={data.value.symbols.length.toLocaleString('en')}
          label={data.value.symbols.length === 1 ? 'symbol in range' : 'symbols in range'}
        />
        <SummaryMetric value={samples.toLocaleString('en')} label="samples" />
        <SummaryMetric
          value={data.value.manifestCount.toLocaleString('en')}
          label={data.value.manifestCount === 1 ? 'manifest' : 'manifests'}
        />
      </dl>

      {data.value.symbols.length ? (
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
              {data.value.symbols.map((symbol) => (
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

const Pagination = component$<{ hasNext: boolean; page: number }>(({ hasNext, page }) => {
  const buttonClass = '!min-h-[41px]';
  return (
    <nav aria-label="Pagination" class="flex items-center gap-editorial-6 self-end md:self-auto">
      {page > 1 ? (
        <ButtonLink href={`?page=${page - 1}`} theme="secondary" class={buttonClass}>
          ← Previous
        </ButtonLink>
      ) : (
        <Button disabled theme="secondary" class={buttonClass}>
          ← Previous
        </Button>
      )}
      <span class="text-editorial-12 font-semibold whitespace-nowrap">Page {page}</span>
      {hasNext ? (
        <ButtonLink href={`?page=${page + 1}`} theme="primary" class={buttonClass}>
          Next →
        </ButtonLink>
      ) : (
        <Button disabled theme="primary" class={buttonClass}>
          Next →
        </Button>
      )}
    </nav>
  );
});
