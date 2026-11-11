import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { computeBundles, computeSymbolVectors } from '~/stats/edges';
import { createBundleViewData, type BundleInfo } from './bundle-view';
import { BundleExplorer } from './bundle-explorer';
import { loadSymbolGraph } from './bundle-data';

export const head: DocumentHead = {
  title: 'Bundles | Qwik Insights',
};

export const useData = routeLoader$<BundleInfo>(async ({ params, url }) => {
  const rootSymbol = await loadSymbolGraph(params.publicApiKey, url);
  const vectors = computeSymbolVectors(rootSymbol, true);
  const bundles = computeBundles(vectors);
  return createBundleViewData(vectors, bundles);
});

export default component$(() => {
  const data = useData();
  return <BundleExplorer data={data.value} />;
});
