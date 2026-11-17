import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export const ByUrlLinks = component$(() => (
  <nav class="fixture" data-fixture="navigation/by-url">
    <h2>navigation, layout that renders from the URL</h2>
    <Link
      href="/navigation/by-url/b/"
      prefetchBundles="off"
      prefetchData="off"
      data-testid="link-by-url-b"
    >
      Page b
    </Link>
  </nav>
));
