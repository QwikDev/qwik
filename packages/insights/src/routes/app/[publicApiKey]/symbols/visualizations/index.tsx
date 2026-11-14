import { component$ } from '@qwik.dev/core';
import { routeLoader$, useLocation, type DocumentHead } from '@qwik.dev/router';
import { computeBundles, computeSymbolVectors } from '~/stats/edges';
import { loadSymbolGraph } from '../bundles/bundle-data';
import { createBundleViewData } from '../bundles/bundle-view';
import { VisualizationExplorer } from './visualization-explorer';

export const head: DocumentHead = { title: 'Relationship visualization lab | Qwik Insights' };
export const useVisualizations = routeLoader$(async ({ params, url }) => {
  const graph = await loadSymbolGraph(params.publicApiKey, url);
  const vectors = computeSymbolVectors(graph, true);
  return createBundleViewData(vectors, computeBundles(vectors));
});
export default component$(() => {
  const data = useVisualizations();
  const location = useLocation();
  return (
    <VisualizationExplorer
      data={data.value}
      currentSearch={location.url.search}
      initialView={location.url.searchParams.get('view') || 'groups'}
    />
  );
});
