import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { getDB } from '~/db';
import { computeSymbolGraph, type Symbol } from '~/stats/edges';
import { getSymbolDetails, getEdges } from '~/db/query';
import { css } from '~/styled-system/css';
import { dbGetManifestHashes } from '~/db/sql-manifest';

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
      <h1>Symbols</h1>
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
    <section class={terminal && css({ color: 'lightgray' })}>
      {symbol.count > 0 && (
        <span>
          ({count} / {symbol.count}) {symbol.name} <code>{symbol.fullName}</code>{' '}
          <code>{symbol.fileSrc}</code> [{symbol.depth}]
        </span>
      )}
      {!terminal && (
        <ul
          class={css({
            listStyle: 'circle',
            marginLeft: '1rem',
          })}
        >
          {symbol.children.map((edge) => (
            <li key={edge.to.name}>
              <SymbolTree symbol={edge.to} depth={nextDepth} count={edge.count} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
