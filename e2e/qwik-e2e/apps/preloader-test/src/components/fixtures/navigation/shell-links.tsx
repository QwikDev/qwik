import { component$ } from '@qwik.dev/core';
import { Link, useNavigate } from '@qwik.dev/router';

export const ShellLinks = component$(() => {
  const nav = useNavigate();
  return (
    <nav class="fixture" data-fixture="navigation/shell">
      <h2>navigation, nested layouts</h2>
      <Link
        href="/navigation/shell/home/"
        prefetchBundles="off"
        prefetchData="off"
        data-testid="link-home"
      >
        Shell home
      </Link>
      <Link
        href="/navigation/shell/docs/a/"
        prefetchBundles="off"
        prefetchData="off"
        data-testid="link-docs-a"
      >
        Docs a
      </Link>
      <Link
        href="/navigation/shell/docs/b/"
        prefetchBundles="off"
        prefetchData="off"
        data-testid="link-docs-b"
      >
        Docs b
      </Link>
      <Link href="/navigation/shell/docs/b/" prefetchData="off" data-testid="link-docs-b-visible">
        Docs b, prefetched when visible
      </Link>
      <Link
        href="/navigation/by-url/a/"
        prefetchBundles="intent"
        prefetchData="off"
        data-testid="link-by-url-a-intent"
      >
        Another layout, prefetched on intent
      </Link>
      <button data-testid="nav-docs-a" onClick$={() => nav('/navigation/shell/docs/a/')}>
        Docs a, with nav()
      </button>
    </nav>
  );
});
