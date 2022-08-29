import { component$, useContextProvider, useStore } from '@builder.io/qwik';
import { QwikCity, RouterOutlet, ServiceWorkerRegister } from '@builder.io/qwik-city';
import { Head } from './components/head/head';
import { GlobalStore, SiteStore } from './context';
import './global.css';

export default component$(() => {
  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
  });

  useContextProvider(GlobalStore, store);

  return (
    <QwikCity>
      <Head />
      <body
        class={{
          'header-open': store.headerMenuOpen,
          'menu-open': store.sideMenuOpen,
        }}
      >
        <RouterOutlet />
        <ServiceWorkerRegister />
      </body>
    </QwikCity>
  );
});
