import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
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
          <code class="text-xs ml-3 whitespace-nowrap">
            <span class="font-bold">{(symbol.name as string | undefined) ?? 'n/A'}</span>
            <span class="text-purple-500 mx-2">|</span>
            {symbol.fullName ?? 'n/A'}
            <span class="text-purple-500 mx-2">|</span>
            {symbol.fileSrc || 'n/A'}
            <span class="text-purple-500 mx-2">|</span>
            Depth:{' '}
            <span class="bg-slate-200 inline-block py-[2px] px-2 text-xs text-center rounded-full">
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
