import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$ } from '@qwik.dev/router';

let runCount = 0;

export const useCatchallLoader = routeLoader$(
  ({ params, url }) => {
    return {
      pathname: url.pathname,
      runCount: ++runCount,
      slug: params.slug,
    };
  },
  { serializationStrategy: 'always' }
);

export default component$(() => {
  const data = useCatchallLoader();

  return (
    <div>
      <h1>Catchall Loader</h1>
      <p id="catchall-loader-slug">slug: {data.value.slug}</p>
      <p id="catchall-loader-pathname">pathname: {data.value.pathname}</p>
      <p id="catchall-loader-runs">runs: {data.value.runCount}</p>
      <nav>
        <Link
          href="/qwikrouter-test/catchall-loader/one/"
          id="catchall-loader-link-one"
          prefetchData="off"
        >
          One
        </Link>
        <Link
          href="/qwikrouter-test/catchall-loader/two/nested/"
          id="catchall-loader-link-two"
          prefetchData="off"
        >
          Two Nested
        </Link>
      </nav>
    </div>
  );
});
