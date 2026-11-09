import { component$, useSignal } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  const showLink = useSignal(false);
  return (
    <>
      <button id="show-link" onClick$={() => (showLink.value = true)}>
        Show link
      </button>
      {showLink.value && (
        <Link
          id="client-link"
          href="/qwikrouter-test.prod/redirect-only/final/"
          prefetchBundles="off"
          prefetchData="off"
        >
          Navigate
        </Link>
      )}
    </>
  );
});
