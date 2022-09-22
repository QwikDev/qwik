import { component$, useContextProvider, useStore, useStyles$ } from '@builder.io/qwik';
import { QwikCity, RouterOutlet, ServiceWorkerRegister } from '@builder.io/qwik-city';
import { RouterHead } from './components/router-head/router-head';
import { GlobalStore, SiteStore } from './context';
import styles from './global.css?inline';

export default component$(() => {
  useStyles$(styles);

  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
  });

  useContextProvider(GlobalStore, store);

  return (
    <QwikCity>
      <head>
        <meta charSet="utf-8" />
        <RouterHead />
      </head>
      <body
        class={{
          'header-open': store.headerMenuOpen,
          'menu-open': store.sideMenuOpen,
        }}
      >
        <RouterOutlet />
        <ServiceWorkerRegister />
        <script
          dangerouslySetInnerHTML={`
        document.addEventListener('qsymbol', (ev) => {
          console.debug('QSymbol', ev.detail.symbol);
        });
        `}
        ></script>
      </body>
    </QwikCity>
  );
});
