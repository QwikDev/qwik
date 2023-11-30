import { component$, type ReadonlySignal } from "@builder.io/qwik";
import { routeLoader$, useLocation } from "@builder.io/qwik-city";
import Histogram from "~/components/histogram";
import { RoutesIcon } from "~/components/icons/routes";
import { SymbolTile } from "~/components/symbol-tile";
import { getDB } from "~/db";
import { dbGetManifestHashes } from "~/db/sql-manifest";
import { getRouteTimeline, type RouteSymbolRow } from "~/db/sql-routes";
import { TIMELINE_BUCKETS, vectorAvg, vectorSum } from "~/stats/vector";

export const useRouteData = routeLoader$(async ({ params }) => {
  const db = getDB();
  const publicApiKey = params.publicApiKey;
  const route = decodeURIComponent(params.route);
  const manifestHashes = await dbGetManifestHashes(db, publicApiKey);
  const routes = await getRouteTimeline(
    db,
    publicApiKey,
    route,
    manifestHashes,
  );
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
      <ul>
        {symbolData.value.map((symbol) => (
          <li key={symbol.symbolName}>
            <Histogram vector={symbol.timeline} buckets={TIMELINE_BUCKETS} />
            <SymbolTile symbol={symbol.symbolName} />
            {" - "}
            {symbol.timelineCount.toLocaleString()}
            {" / "}
            {Math.round(symbol.timelineDelay / 1000).toLocaleString()} seconds
          </li>
        ))}
      </ul>
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
