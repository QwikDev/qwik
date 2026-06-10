import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$ } from '@qwik.dev/router';

export const useSearchCacheLoader = routeLoader$(
  ({ params, url }) => {
    return {
      id: params.id,
      keep: url.searchParams.get('keep') ?? '',
      noise: url.searchParams.get('noise') ?? 'none',
      token: Math.random().toString(36).slice(2),
    };
  },
  {
    search: ['keep'],
  }
);

export default component$(() => {
  const data = useSearchCacheLoader();

  return (
    <main>
      <p id="search-cache-route-path">routePath: {data.value.id}</p>
      <p id="search-cache-keep">keep: {data.value.keep}</p>
      <p id="search-cache-noise">noise: {data.value.noise}</p>
      <p id="search-cache-token">token: {data.value.token}</p>

      <Link
        id="link-search-cache-alpha-second"
        href="/qwikrouter-test/loaders/search-cache/alpha/?keep=one&noise=second"
      >
        Alpha second
      </Link>
      <Link
        id="link-search-cache-beta"
        href="/qwikrouter-test/loaders/search-cache/beta/?keep=one&noise=second"
      >
        Beta
      </Link>
    </main>
  );
});
