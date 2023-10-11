import { component$, type ReadonlySignal } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram from '~/components/histogram';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { getRoutes, type RouteSymbolRow } from '~/db/sql-routes';
import { TIMELINE_BUCKETS, vectorAvg, vectorSum } from '~/stats/vector';
import { css } from '~/styled-system/css';

export const useRouteData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const manifestHashes = await dbGetManifestHashes(db, publicApiKey);
  const routes = await getRoutes(db, publicApiKey, manifestHashes);
  return routeRowsToRouteTree(routes);
});

export default component$(() => {
  const routeData: ReadonlySignal<RouteData[]> = useRouteData();
  return (
    <div>
      <ul>
        {routeData.value.map((route) => (
          <li key={route.route}>
            <code>{route.route}</code>
            <ol
              class={css({
                marginLeft: '1.5rem',
              })}
            >
              {route.symbols.map((symbol) => (
                <li key={symbol.symbolName}>
                  <Histogram vector={symbol.timeline} buckets={TIMELINE_BUCKETS} />
                  <SymbolTile symbol={symbol.symbolName} />
                  {' - '}
                  {symbol.timelineCount.toLocaleString()}
                  {' / '}
                  {Math.round(symbol.timelineDelay / 1000).toLocaleString()} seconds
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  );
});

interface RouteData {
  route: string;
  symbols: {
    symbolName: string;
    timelineDelay: number;
    timelineCount: number;
    timeline: number[];
  }[];
}

function routeRowsToRouteTree(routes: RouteSymbolRow[]): RouteData[] {
  const routeMap = new Map<string, RouteData>();
  routes.forEach((route) => {
    const routeData = getRoute(route.route);
    routeData.symbols.push({
      symbolName: route.symbol,
      timelineDelay: vectorAvg(route.timeline, TIMELINE_BUCKETS),
      timelineCount: vectorSum(route.timeline),
      timeline: route.timeline,
    });
  });
  return Array.from(routeMap.values());
  ///////////

  function getRoute(route: string): RouteData {
    let routeData = routeMap.get(route);
    if (routeData == undefined) {
      routeMap.set(route, (routeData = { route, symbols: [] }));
    }
    return routeData;
  }
}
