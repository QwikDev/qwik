import { component$, useContextProvider, useStore } from '@builder.io/qwik';
import { Content } from '@builder.io/qwik-city';
import { GlobalStore, SiteStore } from '../../context';

export const Body = component$(() => {
  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
  });
  useContextProvider(GlobalStore, store);

  return (
    <body
      class={{
        'header-open': store.headerMenuOpen,
        'menu-open': store.sideMenuOpen,
      }}
    >
      <Content />
      <script src="https://cdn.jsdelivr.net/npm/@docsearch/js@3"></script>
    </body>
  );
});
