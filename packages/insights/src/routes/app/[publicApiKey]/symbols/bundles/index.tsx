import { loadReportScope } from '~/db/report-scope';
import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { getDB } from '~/db';
import { getSymbolGraphEdges, getSymbolDetails } from '~/db/query';
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

  const { selectedHash } = await loadReportScope(db, params.publicApiKey, url.searchParams);
  const manifestHashes = selectedHash ? [selectedHash] : [];
  const edges = await getSymbolGraphEdges(db, params.publicApiKey, { limit, manifestHashes });
  const details = selectedHash
    ? await getSymbolDetails(db, params.publicApiKey, { manifestHashes })
    : [];
  const rootSymbol = computeSymbolGraph(edges, details);
  const vectors = computeSymbolVectors(rootSymbol, true);
  const bundles = computeBundles(vectors);
  return createBundleViewData(vectors, bundles);
});

export default component$(() => {
  const data = useData();
  return <BundleExplorer data={data.value} />;
});
