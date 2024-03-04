import { component$, type ReadonlySignal } from '@builder.io/qwik';
import { routeLoader$, useLocation } from '@builder.io/qwik-city';
import Histogram from '~/components/histogram';
import { RoutesIcon } from '~/components/icons/routes';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { getRouteTimeline, type RouteSymbolRow } from '~/db/sql-routes';
import { TIMELINE_BUCKETS, vectorAvg, vectorSum } from '~/stats/vector';

export const useRouteData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const route = decodeURIComponent(params.route);
  const manifestHashes = await dbGetManifestHashes(db, publicApiKey);
  const routes = await getRouteTimeline(db, publicApiKey, route, manifestHashes);
  return routeRowsToRouteTree(routes);
});

export default component$(() => {
  const symbolData: ReadonlySignal<SymbolData[]> = useRouteData();
  const route = decodeURIComponent(useLocation().params.route);
  return (
    <div>
      <h1 class="h3">
        <RoutesIcon />
        Route: <tt>{route}</tt>
      </h1>
      <table class="w-full text-sm text-left">
        <thead class="text-xs text-slate-700 uppercase">
          <tr class="border-b border-slate-200">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Symbol
            </th>
            <th scope="col" class="px-6 py-3">
              Count
            </th>
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Delay
            </th>
            <th scope="col" class="px-6 py-3">
              Histogram
            </th>
          </tr>
        </thead>
        <tbody>
          {symbolData.value.map((symbol) => (
            <tr key={symbol.symbolName} class="border-b border-slate-200 text-xs">
              <th scope="col" class="px-6 py-3 bg-slate-50 max-w-[250px] overflow-scroll">
                <SymbolTile symbol={symbol.symbolName} />
              </th>
              <td scope="col" class="px-6 py-3">
                {symbol.timelineCount.toLocaleString()}
              </td>
              <td scope="col" class="px-6 py-3 bg-slate-50">
                {Math.round(symbol.timelineDelay / 1000).toLocaleString()} seconds
              </td>
              <td scope="col" class="px-6 py-3 ">
                <Histogram vector={symbol.timeline} buckets={TIMELINE_BUCKETS} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

interface SymbolData {
  symbolName: string;
  timelineDelay: number;
  timelineCount: number;
  timeline: number[];
}

function routeRowsToRouteTree(routes: RouteSymbolRow[]): SymbolData[] {
  return routes.map((route) => {
    return {
      symbolName: route.symbol,
      timelineDelay: vectorAvg(route.timeline, TIMELINE_BUCKETS),
      timelineCount: vectorSum(route.timeline),
      timeline: route.timeline,
    };
  });
}
