import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, useLocation } from '@qwik.dev/router';

// Every slug renders this same route, so a navigation between slugs only changes loader data.
export const usePage = routeLoader$(async ({ params }) => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return `Content for ${params.slug}`;
});

export default component$(() => {
  const loc = useLocation();
  const page = usePage();
  return (
    <>
      <p id="navigating-loader-state">{loc.isNavigating ? 'navigating' : 'idle'}</p>
      <h1 id="navigating-loader-content">{page.value}</h1>
      <Link id="navigating-loader-link" href="/qwikrouter-test/navigating-loader/b/">
        b
      </Link>
    </>
  );
});
