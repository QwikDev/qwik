import { component$, Pending, useSignal, useTask$ } from '@qwik.dev/core';
import { routeLoader$, useLocation, useNavigate } from '@qwik.dev/router';

export const useList = routeLoader$(
  async ({ url }) => {
    // Keep the background loader running past the SSR response so the browser fetches it.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const q = url.searchParams.get('q') ?? '';
    return ['Bianchi', 'Rossi', 'Verdi'].filter((n) => n.toLowerCase().includes(q.toLowerCase()));
  },
  { search: ['q'], blockSSR: false }
);

const List = component$(() => {
  const list = useList();
  return (
    <ul id="list">
      {list.value.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
});

export default component$(() => {
  const loc = useLocation();
  const nav = useNavigate();
  // The field comes from the URL, and follows it on back/forward.
  const query = useSignal(loc.url.searchParams.get('q') ?? '');
  useTask$(({ track }) => {
    track(() => loc.url.search);
    query.value = loc.url.searchParams.get('q') ?? '';
  });

  return (
    <main>
      <button id="filter" onClick$={() => nav('/qwikrouter-test/issue9247/?q=Bianchi')}>
        Filter
      </button>
      <input id="q" bind:value={query} />
      <p id="url-search">{loc.url.search}</p>
      <p id="nav-status">{loc.isNavigating ? 'navigating' : 'idle'}</p>
      <Pending fallback$={() => <p id="fallback">loading...</p>}>
        <List />
      </Pending>
    </main>
  );
});
