import { component$ } from '@qwik.dev/core';
import { routeLoader$, useLocation, type DocumentHead } from '@qwik.dev/router';
import { computeBundles, computeSymbolVectors } from '~/stats/edges';
import { loadSymbolGraphData } from '../bundles/bundle-data';
import { createBundleViewData } from '../bundles/bundle-view';
import { VisualizationExplorer } from './visualization-explorer';
import { getObservedEdges } from './visualizations';

export const head: DocumentHead = { title: 'Relationship visualization lab | Qwik Insights' };
export const useVisualizations = routeLoader$(async ({ params, url }) => {
  const { graph, edges } = await loadSymbolGraphData(params.publicApiKey, url);
  const vectors = computeSymbolVectors(graph);
  const observedEdges = getObservedEdges(
    edges,
    new Set(vectors.symbols.map((symbol) => symbol.name))
  );
  return { ...createBundleViewData(vectors, computeBundles(vectors)), observedEdges };
});
export default component$(() => {
  const data = useVisualizations();
  const location = useLocation();
  return (
    <VisualizationExplorer
      data={data.value}
      initialView={location.url.searchParams.get('view') || 'groups'}
    />
  );
});
