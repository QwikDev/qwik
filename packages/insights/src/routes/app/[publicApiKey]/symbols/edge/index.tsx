import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import { getDB } from '~/db';
import { computeSymbolGraph, type Symbol } from '~/stats/edges';
import { getSymbolDetails, getEdges } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { SymbolIcon } from '~/components/icons/symbol';

export const useRootSymbol = routeLoader$(async ({ params, url }) => {
  const db = getDB();
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!)
    : undefined;
  const manifestHashes = await dbGetManifestHashes(db, params.publicApiKey);
  const [symbols, details] = await Promise.all([
    getEdges(db, params.publicApiKey, { limit, manifestHashes }),
    getSymbolDetails(db, params.publicApiKey, { manifestHashes }),
  ]);
  return computeSymbolGraph(symbols, details);
});

export default component$(() => {
  const rootSymbol = useRootSymbol();
  return (
    <div>
      <h1 class="h3">
        <SymbolIcon />
        Symbols
      </h1>
      <SymbolTree symbol={rootSymbol.value[0]} depth={0} />
    </div>
  );
});

function SymbolTree({ symbol, depth, count }: { symbol: Symbol; depth: number; count?: number }) {
  const nextDepth = depth + 1;
  symbol.children.sort(
    (a, b) => (b.to.depth === nextDepth ? b.count : 0) - (a.to.depth === nextDepth ? a.count : 0)
  );
  const terminal = symbol.depth !== depth;
  return (
    <>
      {depth === 0 && (
        <div>
          <span class="rounded-full bg-purple-500 px-4 py-1 text-xs whitespace-nowrap text-white">
            App
          </span>
        </div>
      )}

      {symbol.count > 0 && (
        <div class="whitespace-nowrap">
          <span class="inline-block min-w-[120px] rounded-full bg-white py-1 text-center text-xs whitespace-nowrap">
            {count} / {symbol.count}
          </span>
          <code class="ml-3 text-xs whitespace-nowrap">
            <span class="font-bold">{(symbol.name as string | undefined) ?? 'n/A'}</span>
            <span class="mx-2 text-purple-500">|</span>
            {symbol.fullName ?? 'n/A'}
            <span class="mx-2 text-purple-500">|</span>
            {symbol.fileSrc || 'n/A'}
            <span class="mx-2 text-purple-500">|</span>
            Depth:{' '}
            <span class="inline-block rounded-full bg-slate-200 px-2 py-[2px] text-center text-xs">
              {symbol.depth}
            </span>
          </code>
        </div>
      )}
      {!terminal && (
        <ul>
          {symbol.children.map((edge) => (
            <li
              key={edge.to.name}
              class="relative pt-2 pl-14 before:absolute before:top-[1px] before:left-6 before:h-full before:w-[1px] before:border-l before:border-dashed before:border-l-slate-400 after:absolute after:top-5 after:left-6 after:h-[1px] after:w-6 after:border-t after:border-dashed after:border-t-slate-400 last:before:h-[19px]"
            >
              <SymbolTree symbol={edge.to} depth={nextDepth} count={edge.count} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
