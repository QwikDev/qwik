import { component$, useSignal, useStore, type JSXOutput } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { BundleCmp } from '~/components/bundle';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getEdges, getSymbolDetailsByHashes } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import {
  computeBundles,
  computeSymbolGraph,
  computeSymbolVectors,
  type Bundle,
  type Symbol,
  type SymbolVectors,
} from '~/stats/edges';
import { vectorSum } from '~/stats/vector';
import {
  getBundleExecutionCount,
  getMatrixCellColor,
  getStrongestRelationships,
} from './bundle-view';

interface BundleInfo {
  vectors: SymbolVectors;
  bundles: Bundle[];
}

export const head: DocumentHead = {
  title: 'Bundles | Qwik Insights',
};

export const useData = routeLoader$<BundleInfo>(async ({ params, url }) => {
  const db = getDB();
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!)
    : undefined;

  const manifestHashes = await dbGetManifestHashes(db, params.publicApiKey);
  const edges = await getEdges(db, params.publicApiKey, { limit, manifestHashes });
  const symbolHashes = Array.from(
    new Set(
      edges
        .flatMap((edge) => [edge.from, edge.to])
        .filter((symbol): symbol is string => Boolean(symbol))
        .map((symbol) => symbol.split('_').pop()!)
    )
  );
  const details = await getSymbolDetailsByHashes(db, params.publicApiKey, symbolHashes);
  const rootSymbol = computeSymbolGraph(edges, details);
  const vectors = computeSymbolVectors(rootSymbol);
  const bundles = computeBundles(vectors);
  return { vectors, bundles };
});

export default component$(() => {
  const data = useData();
  const selectedIndex = useSignal(0);
  const selectedBundle = data.value.bundles.at(selectedIndex.value) ?? data.value.bundles.at(0);
  const strongestRelationships = selectedBundle
    ? getStrongestRelationships(selectedBundle.symbols, data.value.vectors).slice(0, 10)
    : [];

  return (
    <div class="font-editorial-ui text-editorial-primary">
      <header class="grid gap-editorial-6 border-b border-editorial-border pb-editorial-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
            Bundle analysis
          </p>
          <h1 class="mt-editorial-2 text-editorial-44 font-bold leading-[1.1] tracking-[-0.035em]">
            Bundle lens
          </h1>
          <p class="mt-editorial-2 max-w-2xl text-editorial-14 text-editorial-secondary">
            Inspect symbol groups derived from execution relationships across the latest 100
            manifests.
          </p>
        </div>
        {selectedBundle && (
          <div class="md:text-right">
            <code class="font-editorial-mono text-editorial-20 font-semibold">
              {selectedBundle.name}
            </code>
            <p class="mt-editorial-1 text-editorial-12 text-editorial-secondary">
              {selectedBundle.symbols.length.toLocaleString('en')} symbols ·{' '}
              {getBundleExecutionCount(selectedBundle).toLocaleString('en')} executions
            </p>
          </div>
        )}
      </header>

      <div class="flex flex-wrap items-baseline gap-x-editorial-2 gap-y-editorial-1 py-editorial-6">
        <strong class="text-editorial-24 font-semibold">
          {data.value.bundles.length.toLocaleString('en')} bundles
        </strong>
        <span class="text-editorial-14 text-editorial-secondary">
          across {data.value.vectors.symbols.length.toLocaleString('en')} recorded symbols
        </span>
      </div>

      {selectedBundle ? (
        <>
          <section
            class="border-y border-editorial-border py-editorial-6"
            aria-labelledby="matrix-title"
          >
            <div class="flex flex-wrap items-end justify-between gap-editorial-4">
              <div>
                <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
                  Relationship matrix
                </p>
                <h2 id="matrix-title" class="mt-editorial-2 text-editorial-20 font-semibold">
                  {data.value.vectors.symbols.length.toLocaleString('en')} recorded symbols
                </h2>
                <p class="mt-editorial-1 text-editorial-12 text-editorial-secondary">
                  Darker cells indicate stronger observed relationships.
                </p>
              </div>
              <p class="text-editorial-12 text-editorial-secondary">Latest 100 manifests</p>
            </div>
            <div class="mt-editorial-5 max-w-full overflow-auto">
              <CorrelationMatrix
                matrix={data.value.vectors.vectors}
                symbols={data.value.vectors.symbols}
              />
            </div>
          </section>

          <div class="grid border-b border-editorial-border xl:grid-cols-[15rem_minmax(28rem,1fr)_minmax(20rem,0.8fr)]">
            <section
              class="min-w-0 border-b border-editorial-border xl:border-r xl:border-b-0"
              aria-labelledby="bundle-list-title"
            >
              <div class="border-b border-editorial-border px-editorial-5 py-editorial-4">
                <h2
                  id="bundle-list-title"
                  class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase"
                >
                  Bundles
                </h2>
              </div>
              <ol class="p-editorial-2">
                {data.value.bundles.map((bundle, index) => {
                  const isSelected = index === selectedIndex.value;
                  return (
                    <li key={bundle.name}>
                      <button
                        type="button"
                        class={[
                          'w-full cursor-pointer rounded-editorial-md px-editorial-3 py-editorial-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-editorial-accent',
                          isSelected ? 'bg-editorial-selected' : 'hover:bg-editorial-subtle',
                        ]}
                        aria-pressed={isSelected}
                        onClick$={() => {
                          selectedIndex.value = index;
                        }}
                      >
                        <span class="block truncate text-editorial-12 font-semibold">
                          <BundleCmp name={bundle.name} />
                        </span>
                        <span class="mt-editorial-1 block text-editorial-11 text-editorial-muted">
                          {bundle.symbols.length.toLocaleString('en')} symbols ·{' '}
                          {getBundleExecutionCount(bundle).toLocaleString('en')} executions
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section
              class="min-w-0 border-b border-editorial-border xl:border-r xl:border-b-0"
              aria-labelledby="symbol-evidence-title"
            >
              <div class="border-b border-editorial-border px-editorial-5 py-editorial-4">
                <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
                  Selected bundle
                </p>
                <h2
                  id="symbol-evidence-title"
                  class="mt-editorial-2 text-editorial-20 font-semibold"
                >
                  Symbols in this bundle
                </h2>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full min-w-[360px] text-left text-editorial-12">
                  <thead class="sticky top-0 border-b border-editorial-border bg-editorial-canvas text-editorial-11 tracking-[0.04em] text-editorial-muted uppercase">
                    <tr>
                      <th class="px-editorial-5 py-editorial-3 font-semibold">Symbol</th>
                      <th class="px-editorial-3 py-editorial-3 text-right font-semibold">
                        Executions
                      </th>
                      <th class="px-editorial-5 py-editorial-3 font-semibold">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedBundle.symbols.map((symbol) => (
                      <tr key={symbol.name} class="border-b border-editorial-border align-top">
                        <th class="max-w-64 px-editorial-5 py-editorial-4 font-normal">
                          {symbol.fullName && (
                            <code class="block truncate font-editorial-mono text-editorial-12 font-semibold">
                              {symbol.fullName}
                            </code>
                          )}
                          <span
                            class={[
                              'block truncate font-editorial-mono text-editorial-11',
                              symbol.fullName
                                ? 'mt-editorial-1 text-editorial-link'
                                : 'font-semibold',
                            ]}
                          >
                            <SymbolTile
                              symbol={symbol.name}
                              fullName={symbol.fullName}
                              origin={symbol.fileSrc}
                            />
                          </span>
                        </th>
                        <td class="px-editorial-3 py-editorial-4 text-right font-semibold">
                          {symbol.count.toLocaleString('en')}
                        </td>
                        <td class="max-w-52 px-editorial-5 py-editorial-4">
                          {symbol.fileSrc ? (
                            <code class="block truncate font-editorial-mono text-editorial-11 text-editorial-secondary">
                              {symbol.fileSrc}
                            </code>
                          ) : (
                            <span class="text-editorial-11 text-editorial-muted">
                              Metadata unavailable
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section class="min-w-0" aria-labelledby="relationship-list-title">
              <div class="border-b border-editorial-border px-editorial-5 py-editorial-4">
                <p class="text-editorial-11 font-semibold tracking-[0.04em] text-editorial-muted uppercase">
                  Selected bundle
                </p>
                <h2
                  id="relationship-list-title"
                  class="mt-editorial-2 text-editorial-20 font-semibold"
                >
                  Strongest relationships
                </h2>
              </div>
              {strongestRelationships.length ? (
                <ol>
                  {strongestRelationships.map((relationship, index) => {
                    const score = Math.round(relationship.score * 100);
                    return (
                      <li
                        key={`${relationship.from}:${relationship.to}`}
                        class="border-b border-editorial-border px-editorial-5 py-editorial-4"
                      >
                        <div class="flex items-start gap-editorial-3">
                          <span class="text-editorial-11 text-editorial-muted">{index + 1}</span>
                          <div class="min-w-0 flex-1 font-editorial-mono text-editorial-11 font-semibold">
                            <span class="block truncate">
                              <SymbolTile symbol={relationship.from} />
                            </span>
                            <span class="mt-editorial-1 block truncate text-editorial-secondary">
                              with <SymbolTile symbol={relationship.to} />
                            </span>
                          </div>
                          <span class="font-editorial-mono text-editorial-11">{score}%</span>
                        </div>
                        <div class="mt-editorial-3 h-1 bg-editorial-data-band">
                          <div
                            class="h-full bg-editorial-data-current"
                            style={{ width: `${score}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p class="px-editorial-5 py-editorial-8 text-editorial-12 text-editorial-muted">
                  No relationships recorded for this bundle.
                </p>
              )}
            </section>
          </div>
        </>
      ) : (
        <section class="border-t border-editorial-border py-editorial-16">
          <h2 class="text-editorial-24 font-semibold">No bundle relationships yet</h2>
          <p class="mt-editorial-2 text-editorial-14 text-editorial-secondary">
            Bundles will appear after symbol executions are recorded.
          </p>
        </section>
      )}
    </div>
  );
});

export const CorrelationMatrix = component$<{
  matrix: number[][];
  symbols: Symbol[];
}>(({ matrix, symbols }) => {
  const callout = useStore({
    visible: false,
    value: 0,
    rowSymbol: '',
    colSymbol: '',
    x: 0,
    y: 0,
  });
  return (
    <>
      <div
        class="border border-editorial-border h-[calc(70vmin-20px)] w-[calc(70vmin-20px)] flex flex-col justify-evenly mb-14"
        onMouseEnter$={() => (callout.visible = true)}
        onMouseLeave$={() => (callout.visible = false)}
        onMouseMove$={(e) => {
          callout.x = e.clientX;
          callout.y = e.clientY;
          const col = e.target as HTMLElement;
          const row = col.parentNode as HTMLElement;
          callout.value = parseFloat(col.dataset.value!);
          callout.colSymbol = col.dataset.colSymbol!;
          callout.rowSymbol = row.dataset.rowSymbol!;
        }}
      >
        <MatrixCells matrix={matrix} symbols={symbols} />
      </div>
      <div
        style={{
          display: callout.visible && !isNaN(callout.value) ? 'inline-block' : 'none',
          top: callout.y + 5 + 'px',
          left: callout.x + 5 + 'px',
        }}
        class="fixed bg-editorial-surface border border-editorial-border text-xs"
      >
        <table class="w-full text-sm text-left">
          <tbody>
            <tr class="border-y border-editorial-border text-xs">
              <th scope="col" class="px-6 py-3 bg-editorial-subtle">
                Score
              </th>
              <td scope="col" class="px-6 py-3">
                <code
                  class={[
                    'rounded-xs px-8 py-1 inline-block',
                    {
                      'bg-editorial-data-current text-editorial-on-accent':
                        Math.round(callout.value * 100) >= 70,
                    },
                    {
                      'bg-editorial-data-previous':
                        Math.round(callout.value * 100) >= 50 &&
                        Math.round(callout.value * 100) < 70,
                    },
                    {
                      'bg-editorial-data-band':
                        Math.round(callout.value * 100) >= 30 &&
                        Math.round(callout.value * 100) < 50,
                    },
                    { 'bg-editorial-subtle': Math.round(callout.value * 100) < 30 },
                  ]}
                >
                  {Math.round(callout.value * 100)}%
                </code>
              </td>
            </tr>
            <tr class="border-b border-editorial-border text-xs">
              <th scope="col" class="px-6 py-3 bg-editorial-subtle">
                Row
              </th>
              <td scope="col" class="px-6 py-3">
                <code>{callout.rowSymbol}</code>
              </td>
            </tr>
            <tr class="border-b border-editorial-border text-xs">
              <th scope="col" class="px-6 py-3 bg-editorial-subtle">
                Column
              </th>
              <td scope="col" class="px-6 py-3">
                <code>{callout.colSymbol}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
});

export const MatrixCells = component$<{
  matrix: number[][];
  symbols: Symbol[];
}>(({ matrix, symbols }) => {
  const size = matrix.length;
  return (
    <>
      {matrix.map((row, rowIdx) => (
        <div
          class="flex"
          style={{ height: 100 / size + '%' }}
          key={rowIdx}
          data-row-symbol={symbols[rowIdx].name}
        >
          {cells(row, symbols)}
        </div>
      ))}
    </>
  );
});

function cells(row: number[], symbols: Symbol[]) {
  const size = row.length;
  const cells: JSXOutput[] = [];
  const total = vectorSum(row);
  let sparseSize = 0;
  for (let colIdx = 0; colIdx < row.length; colIdx++) {
    const value = row[colIdx];
    if (value / total > 0.05) {
      if (sparseSize) {
        cells.push(
          <div class="h-full inline-block" style={{ width: (sparseSize * 100) / size + '%' }} />
        );
        sparseSize = 0;
      }
      cells.push(
        <div
          key={colIdx}
          style={{
            width: 100 / size + '%',
            backgroundColor: getMatrixCellColor(value),
          }}
          data-col-symbol={symbols[colIdx].name}
          data-value={value}
        ></div>
      );
    } else {
      sparseSize++;
    }
  }
  return cells;
}
