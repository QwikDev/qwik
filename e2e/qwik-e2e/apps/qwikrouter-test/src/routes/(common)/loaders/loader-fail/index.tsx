import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$ } from '@qwik.dev/router';

export const useFailingLoader = routeLoader$((ev) => {
  if (ev.query.get('ok') === '1') {
    return { product: 'tshirt' };
  }
  return ev.fail(429, { reason: 'Rate limited' });
});

export default component$(() => {
  const loader = useFailingLoader();

  if (loader.error) {
    return (
      <div id="loader-fail-error">
        {loader.error.status
          ? `${loader.error.status} ${loader.error.reason}`
          : loader.error.message}
      </div>
    );
  }

  return (
    <div>
      <div id="loader-fail-value">{loader.value.product}</div>
      {/* Used by the SPA abort fallback spec */}
      <Link id="link-loader-error" href="/qwikrouter-test/loaders/loader-error/">
        To loader-error
      </Link>
    </div>
  );
});
