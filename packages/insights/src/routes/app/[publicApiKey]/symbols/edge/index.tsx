import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$ } from '@qwik.dev/router';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { computeSymbolGraph, computeSymbolTree, type SymbolTreeNode } from '~/stats/edges';
import { getSymbolGraphEdges } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { SymbolIcon } from '~/components/icons/symbol';

export const useRootSymbol = routeLoader$(async ({ params, url }) => {
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
  if (pageManifestHashes.length === 0) {
    return { rootSymbol: computeSymbolTree(computeSymbolGraph([])[0]), page, hasNext };
  }
  const symbols = await getSymbolGraphEdges(db, params.publicApiKey, {
    limit,
    manifestHashes: pageManifestHashes,
  });
  return { rootSymbol: computeSymbolTree(computeSymbolGraph(symbols)[0]), page, hasNext };
});

export default component$(() => {
  const rootSymbol = useRootSymbol();
  return (
    <div>
      <h1 class="h3">
        <SymbolIcon />
        Symbols
      </h1>
      <nav
        aria-label="Pagination"
        class="mb-6 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
      >
        {rootSymbol.value.page > 1 && (
          <Link
            href={`?page=${rootSymbol.value.page - 1}`}
            class="inline-flex min-w-28 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            ← Previous
          </Link>
        )}
        {rootSymbol.value.page === 1 && (
          <span class="inline-flex min-w-28 cursor-not-allowed items-center justify-center rounded-md border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400">
            ← Previous
          </span>
        )}
        <span class="text-sm font-semibold text-slate-600">Page {rootSymbol.value.page}</span>
        {rootSymbol.value.hasNext && (
          <Link
            href={`?page=${rootSymbol.value.page + 1}`}
            class="inline-flex min-w-28 items-center justify-center rounded-md border border-slate-300 bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300"
          >
            Next →
          </Link>
        )}
        {!rootSymbol.value.hasNext && (
          <span class="inline-flex min-w-28 cursor-not-allowed items-center justify-center rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400">
            Next →
          </span>
        )}
      </nav>
      <SymbolTree symbol={rootSymbol.value.rootSymbol} depth={0} />
    </div>
  );
});

function SymbolTree({
  symbol,
  depth,
  count,
}: {
  symbol: SymbolTreeNode;
  depth: number;
  count?: number;
}) {
  const nextDepth = depth + 1;
  symbol.children.sort(
    (a, b) => (b.to.depth === nextDepth ? b.count : 0) - (a.to.depth === nextDepth ? a.count : 0)
  );
  const terminal = symbol.depth !== depth;
  return (
    <>
      {depth === 0 && (
        <div>
          <span class="bg-purple-500 text-white px-4 py-1 text-xs rounded-full whitespace-nowrap">
            App
          </span>
        </div>
      )}

      {symbol.count > 0 && (
        <div class="whitespace-nowrap">
          <span class="bg-white inline-block py-1 min-w-[120px] text-xs text-center rounded-full whitespace-nowrap">
            {count} / {symbol.count}
          </span>
          <span class="text-xs ml-3 whitespace-nowrap">
            <span class="font-bold">
              <SymbolTile symbol={symbol.name} />
            </span>
            <span class="text-purple-500 mx-2">|</span>
            Depth:{' '}
            <span class="bg-slate-200 inline-block py-[2px] px-2 text-xs text-center rounded-full">
              {symbol.depth}
            </span>
          </span>
        </div>
      )}
      {!terminal && (
        <ul>
          {symbol.children.map((edge) => (
            <li
              key={edge.to.name}
              class="relative pt-2 pl-14 before:absolute before:top-[1px] before:left-6 before:border-l before:border-l-slate-400 before:border-dashed before:h-full before:w-[1px] last:before:h-[19px] after:absolute after:top-5 after:left-6 after:border-t after:border-t-slate-400 after:border-dashed after:h-[1px] after:w-6"
            >
              <SymbolTree symbol={edge.to} depth={nextDepth} count={edge.count} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
