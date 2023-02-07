import {
  component$,
  useContextProvider,
  useStore,
  useStyles$,
  _wrapSignal,
} from '@builder.io/qwik';
import { QwikCity, RouterOutlet, ServiceWorkerRegister } from '@builder.io/qwik-city';
import RealMetricsOptimization from './components/real-metrics-optimization/real-metrics-optimization';
import { RouterHead } from './components/router-head/router-head';
import { GlobalStore, SiteStore } from './context';
import './global.css';
import './components/code-block/code-block.css';

import { BUILDER_PUBLIC_API_KEY } from './constants';

declare global {
  interface ImportMeta {
    env: {
      VITE_ALGOLIA_APP_ID: string;
      VITE_ALGOLIA_SEARCH_KEY: string;
      VITE_ALGOLIA_INDEX: string;
      BASE_URL: '/';
      MODE: 'ssr';
      DEV: boolean;
      PROD: boolean;
      SSR: boolean;
    };
  }
}

export default component$(() => {
  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
    theme: 'auto',
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
        <RealMetricsOptimization builderApiKey={BUILDER_PUBLIC_API_KEY} />
      </body>
    </QwikCity>
  );
});
