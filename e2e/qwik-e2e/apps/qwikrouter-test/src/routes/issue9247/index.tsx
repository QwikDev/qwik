import { component$, isBrowser, Pending, useSignal, useTask$ } from '@qwik.dev/core';
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
  const completedNavigations = useSignal(0);
  // Hold goto's render wait before it updates routeInternal
  useTask$(async ({ track }) => {
    if (track(() => loc.isNavigating) && isBrowser) {
      await (window as any).__issue9247HoldRender?.();
    }
  });
  // The field comes from the URL, and follows it on back/forward.
  const query = useSignal(loc.url.searchParams.get('q') ?? '');
  useTask$(({ track }) => {
    track(() => loc.url.search);
    query.value = loc.url.searchParams.get('q') ?? '';
  });

  return (
    <main>
      <button
        id="filter"
        data-completed-navigations={completedNavigations.value}
        onClick$={async () => {
          await nav('/qwikrouter-test/issue9247/?q=Bianchi');
          completedNavigations.value++;
        }}
      >
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
