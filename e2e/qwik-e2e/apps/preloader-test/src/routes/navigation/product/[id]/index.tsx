import { component$ } from '@qwik.dev/core';
import { Link, useLocation, type DocumentHead } from '@qwik.dev/router';

export default component$(() => {
  const loc = useLocation();
  return (
    <section class="fixture" data-fixture="navigation/product">
      <h2>product page</h2>
      <Link
        href="/navigation/product/2/"
        prefetchBundles="off"
        prefetchData="off"
        data-testid="link-product-2"
      >
        Product 2
      </Link>
      <output data-testid="result" data-done>
        {loc.params.id}
      </output>
    </section>
  );
});

export const head: DocumentHead = { title: 'product page' };
