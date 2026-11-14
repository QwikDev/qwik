import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { getDB } from '~/db';
import { getSymbolGraphEdges, getSymbolDetailsByHashes } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import {
  computeBundles,
  computeSymbolGraph,
  computeSymbolVectors,
  type Symbol,
} from '~/stats/edges';
import { createBundleViewData, type BundleInfo } from './bundle-view';
import { BundleExplorer } from './bundle-explorer';

export const head: DocumentHead = {
  title: 'Bundles | Qwik Insights',
};

export const useData = routeLoader$<BundleInfo>(async ({ params, url }) => {
  const db = getDB();
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!)
    : undefined;

  const manifestHashes = await dbGetManifestHashes(db, params.publicApiKey);
  const edges = await getSymbolGraphEdges(db, params.publicApiKey, { limit, manifestHashes });
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
  const vectors = computeSymbolVectors(rootSymbol, true);
  const bundles = computeBundles(vectors);
  return createBundleViewData(vectors, bundles);
});

export default component$(() => {
  const data = useData();
  return <BundleExplorer data={data.value} />;
});
