import { component$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';

export const NavigationLinks = component$<{ prefetch: 'off' | 'visible' | 'intent' }>(
  ({ prefetch }) => {
    return (
      <section class="fixture" data-fixture={`navigation/from-${prefetch}`}>
        <h2>navigation, prefetchBundles: {prefetch}</h2>
        <Link
          href="/navigation/to-small/"
          prefetchBundles={prefetch}
          prefetchData={prefetch === 'off' ? 'off' : 'intent'}
          data-testid="link-small"
        >
          To a small page
        </Link>
        <Link
          href="/navigation/to-tree/"
          prefetchBundles={prefetch}
          prefetchData={prefetch === 'off' ? 'off' : 'intent'}
          data-testid="link-tree"
        >
          To a tree page
        </Link>
        <Link
          href="/navigation/to-data/"
          prefetchBundles={prefetch}
          prefetchData={prefetch === 'off' ? 'off' : 'intent'}
          data-testid="link-data"
        >
          To a page with a routeLoader$
        </Link>
      </section>
    );
  }
);
