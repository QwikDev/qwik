import { component$, Slot } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export default component$(() => {
  return (
    <>
      <Link href="/qwikrouter-test/layout-loader-catchall/" id="layout-loader-catchall-logo">
        Mock Logo
      </Link>
      <Slot />
    </>
  );
});
