import {
  Resource,
  component$,
  useComputed$,
  useResource$,
  useSignal,
  useStore,
} from '@qwik.dev/core';
import { routeLoader$, type DocumentHead } from '@qwik.dev/router';

export const useSnapshotLoader = routeLoader$(
  async () => {
    return {
      heading: 'SSG Snapshot Fixture',
      stats: [2, 3, 5, 8],
      tags: ['routeLoader$', 'useResource$', 'useSignal'],
      profile: {
        name: 'router-state',
        status: 'stable',
      },
    };
  },
  {
    id: 'ssg-snapshot-loader',
  }
);

export default component$(() => {
  const pageData = useSnapshotLoader();
  const clicks = useSignal(2);
  const filters = useStore({
    expanded: true,
    selected: ['alpha', 'beta'],
    metadata: {
      revision: 3,
      mode: 'ssg',
    },
  });

  const summary = useComputed$(() => {
    return {
      total: pageData.value.stats.reduce((sum, value) => sum + value, 0),
      selectedCount: filters.selected.length,
      clicks: clicks.value,
    };
  });

  const asyncState = useResource$(async ({ track }) => {
    track(() => clicks.value);
    await Promise.resolve();

    return {
      headline: `${pageData.value.profile.name}:${pageData.value.profile.status}`,
      selected: [...filters.selected],
      weighted: pageData.value.stats.map((value, index) => value * (index + 1)),
      summary: summary.value,
    };
  });

  return (
    <main>
      <h1>{pageData.value.heading}</h1>
      <p id="tags">{pageData.value.tags.join(' | ')}</p>
      <section id="loader-json">{JSON.stringify(pageData.value)}</section>
      <section id="summary-json">{JSON.stringify(summary.value)}</section>
      <Resource
        value={asyncState}
        onResolved={(resolved) => <section id="resource-json">{JSON.stringify(resolved)}</section>}
      />
    </main>
  );
});

export const head: DocumentHead = {
  title: 'Qwik Router SSG Snapshot',
  meta: [
    {
      name: 'description',
      content: 'Deterministic SSG snapshot fixture',
    },
  ],
};
