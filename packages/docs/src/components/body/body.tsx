import { component$, Host, useStore, useContextProvider } from '@builder.io/qwik';
import { Content } from '@builder.io/qwik-city';
import { GlobalStore, SiteStore } from '../../utils/context';
// import { useQwikCity } from '@builder.io/qwik-city';

export default component$(
  () => {
    // useScopedStyles$(styles);

    const store = useStore<SiteStore>({
      headerMenuOpen: false,
      sideMenuOpen: false,
    });

    useContextProvider(GlobalStore, store);
    // useQwikCity();

    return (
      <Host
        class={{
          'header-open': store.headerMenuOpen,
          'menu-open': store.sideMenuOpen,
        }}
      >
        <Content />
      </Host>
    );
  },
  {
    tagName: 'body',
  }
);
