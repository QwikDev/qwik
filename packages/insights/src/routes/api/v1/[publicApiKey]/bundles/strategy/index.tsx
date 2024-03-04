import { type RequestHandler } from '@builder.io/qwik-city';
import { getEdges } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { getDB } from '../../../../../../db';
import { computeSymbolGraph, computeSymbolVectors, computeBundles } from '~/stats/edges';
import { getRoutes } from '~/db/sql-routes';

interface Strategy {
  type: 'smart';
  manual: Record<string, string>;
  prefetch: Prefetch[];
}
interface Prefetch {
  route: string;
  symbols: string[];
}

export const onGet: RequestHandler = async ({ json, params }) => {
  const publicApiKey = params.publicApiKey;
  const db = getDB();
  const strategy: Strategy = {
    type: 'smart',
    manual: {},
    prefetch: [],
  };

  const manifestHashes = await dbGetManifestHashes(db, publicApiKey);
  const [symbols, routes] = await Promise.all([
    getEdges(db, publicApiKey, { manifestHashes }),
    getRoutes(db, publicApiKey, manifestHashes),
  ]);

  const rootSymbol = computeSymbolGraph(symbols);
  const vectors = computeSymbolVectors(rootSymbol);
  const bundles = computeBundles(vectors);
  const bundleMap: Record<string, string> = strategy.manual;
  bundles.forEach((bundle) => {
    bundle.symbols.forEach((symbol) => {
      bundleMap[symbol.name] = bundle.name;
    });
  });

  const routeMap = new Map<string, Prefetch>();
  routes.forEach((route) => {
    const prefetch = getRoutePrefetch(route.route);
    prefetch.symbols.push(route.symbol);
  });

  json(200, strategy);
  //////////////////////

  function getRoutePrefetch(route: string): Prefetch {
    let routeData = routeMap.get(route);
    if (routeData == undefined) {
      routeMap.set(route, (routeData = { route, symbols: [] }));
      strategy.prefetch.push(routeData);
    }
    return routeData;
  }
};
