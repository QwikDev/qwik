import { loadReportScope } from '~/db/report-scope';
import { component$, useSignal } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import PageHeader from '~/components/page-header';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { computeSymbolGraph } from '~/stats/edges';
import { createSymbolPaths, getPathChildren, type SymbolPathNode } from '~/stats/symbol-paths';
import { getSymbolGraphEdges, getSymbolDetails } from '~/db/query';

export const useRootSymbol = routeLoader$(async ({ params, url }) => {
  const db = getDB();
  const { selectedHash } = await loadReportScope(db, params.publicApiKey, url.searchParams);
  const pageManifestHashes = selectedHash ? [selectedHash] : [];
  if (pageManifestHashes.length === 0) {
    return { symbols: createSymbolPaths(computeSymbolGraph([])) };
  }
  const symbols = await getSymbolGraphEdges(db, params.publicApiKey, {
    manifestHashes: pageManifestHashes,
  });
  const metadata = await getSymbolDetails(db, params.publicApiKey, {
    manifestHashes: pageManifestHashes,
  });
  return { symbols: createSymbolPaths(computeSymbolGraph(symbols, metadata)) };
});

export default component$(() => {
  const rootSymbol = useRootSymbol();
  const firstEdge = rootSymbol.value.symbols[0].children.at(0);
  return (
    <section>
      <PageHeader
        report="edge"
        eyebrow="Symbol relationships"
        title="Execution paths"
        description="Observed symbol sequences in the selected build."
        class="mb-editorial-8"
      />

      <p class="mb-editorial-4 text-editorial-12 text-editorial-secondary">
        Expand a symbol to follow its observed successors. Counts show this transition / all
        observations of the destination symbol.
      </p>
      <div class="overflow-x-auto">
        <div class="flex h-12 min-w-[36rem] items-center gap-editorial-3 border-b border-editorial-border px-editorial-4 text-editorial-12 text-editorial-secondary">
          <span class="inline-flex min-w-editorial-26 items-center justify-center rounded-editorial-full border border-editorial-border bg-editorial-subtle px-editorial-3 py-editorial-1 font-editorial-mono font-semibold text-editorial-primary">
            {firstEdge
              ? `${firstEdge.count} / ${rootSymbol.value.symbols[firstEdge.to].count}`
              : '— / —'}
          </span>
          <span>triggered / total</span>
          <span class="h-editorial-5 w-px bg-editorial-border-strong" />
          <span class="rounded-editorial-full bg-editorial-subtle px-editorial-3 py-editorial-1 font-semibold text-editorial-primary">
            {firstEdge ? `Depth ${rootSymbol.value.symbols[firstEdge.to].depth}` : 'Depth'}
          </span>
          <span>depth</span>
        </div>

        <div class="min-w-max p-editorial-4">
          <SymbolTree symbols={rootSymbol.value.symbols} index={0} ancestors={[]} />
        </div>
      </div>
    </section>
  );
});

const SymbolTree = component$<{
  symbols: SymbolPathNode[];
  index: number;
  ancestors: number[];
  count?: number;
}>(({ symbols, index, ancestors, count }) => {
  const depth = ancestors.length;
  const symbol = symbols[index];
  const expanded = useSignal(depth === 0);
  const children = getPathChildren(symbols, index, ancestors);
  const terminal = ancestors.includes(index);
  return (
    <>
      {depth === 0 && (
        <div class="mb-editorial-2">
          <span class="inline-flex rounded-editorial-full bg-editorial-data-previous px-editorial-4 py-editorial-1 text-editorial-12 font-bold whitespace-nowrap text-editorial-on-accent">
            App
          </span>
        </div>
      )}

      {symbol.count > 0 && (
        <div class="flex h-6 items-center text-editorial-12 whitespace-nowrap">
          <span class="inline-flex min-w-editorial-26 items-center justify-center rounded-editorial-full border border-editorial-border bg-editorial-surface px-editorial-3 py-editorial-1 font-editorial-mono font-semibold text-editorial-primary">
            {count} / {symbol.count}
          </span>
          <span class="ml-editorial-4 inline-flex min-w-36 items-center font-editorial-mono font-semibold text-editorial-primary">
            <span>
              <SymbolTile symbol={symbol.name} fullName={symbol.fullName} origin={symbol.fileSrc} />
            </span>
          </span>
          <span class="inline-flex rounded-editorial-full bg-editorial-subtle px-editorial-3 py-editorial-1 font-medium text-editorial-secondary">
            Depth {symbol.depth}
          </span>
        </div>
      )}
      {!terminal && children.length > 0 && depth > 0 && (
        <button
          type="button"
          aria-expanded={expanded.value}
          aria-label={`${expanded.value ? 'Collapse' : 'Expand'} successors of ${symbol.fullName || symbol.name} (${symbol.name})`}
          class="my-editorial-2 text-editorial-12 text-editorial-link"
          onClick$={() => {
            expanded.value = !expanded.value;
          }}
        >
          {expanded.value ? 'Collapse' : 'Expand'} {children.length} following symbols
        </button>
      )}
      {!terminal && expanded.value && (
        <ul class="m-0 list-none p-0">
          {children.map((edge) => (
            <li
              key={edge.to}
              class={[
                'relative pt-editorial-2 pl-editorial-14',
                'before:absolute before:top-0 before:left-editorial-6 before:h-full before:w-px last:before:h-[19px]',
                'after:absolute after:top-[19px] after:left-editorial-6 after:h-px after:w-editorial-8',
                depth === 0
                  ? 'before:bg-editorial-accent after:bg-editorial-accent'
                  : 'before:bg-editorial-border-strong after:bg-editorial-border-strong',
              ]}
            >
              <SymbolTree
                symbols={symbols}
                index={edge.to}
                ancestors={[...ancestors, index]}
                count={edge.count}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
});
