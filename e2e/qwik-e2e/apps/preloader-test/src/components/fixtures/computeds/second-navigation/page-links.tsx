import { component$ } from '@qwik.dev/core';
import { Link, useNavigate } from '@qwik.dev/router';

export const PageLinks = component$(() => {
  const nav = useNavigate();
  return (
    <nav>
      <Link
        href="/computeds/second-navigation/b/"
        prefetchBundles="off"
        prefetchData="off"
        data-testid="link-b"
      >
        Page b
      </Link>
      <Link
        href="/computeds/second-navigation/c/"
        prefetchBundles="off"
        prefetchData="off"
        data-testid="link-c"
      >
        Page c
      </Link>
      <button data-testid="nav-c" onClick$={() => nav('/computeds/second-navigation/c/')}>
        Page c, with nav()
      </button>
    </nav>
  );
});
