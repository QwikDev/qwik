import { component$ } from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { BundleExplorer } from './bundle-explorer';
import { loadBundlePreview } from './load-bundle-preview';

export const head: DocumentHead = { title: 'Bundles | Qwik Insights' };

export const useData = routeLoader$(async ({ params, url }) => {
  const limit = url.searchParams.get('limit');
  return loadBundlePreview(params.publicApiKey, limit ? parseInt(limit) : undefined);
});

export default component$(() => {
  const data = useData();
  return <BundleExplorer data={data.value} />;
});
