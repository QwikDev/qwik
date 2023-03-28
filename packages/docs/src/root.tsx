import { component$, useContextProvider, useServerData, useStore } from '@builder.io/qwik';
import {
  QwikCityProvider,
  RouterOutlet,
  ServiceWorkerRegister,
  useLocation,
} from '@builder.io/qwik-city';
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
  const urlEnv = useServerData<string>('url');
  const url = new URL(urlEnv!);

  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
    theme: 'auto',
  });

  useContextProvider(GlobalStore, store);

  return (
    <QwikCityProvider>
      <head>
        <meta charSet="utf-8" />
        <RouterHead />
      </head>
      <body
        class={{
          'header-open': store.headerMenuOpen,
          'menu-open': store.sideMenuOpen,
          [store.bodyClass]: true,
        }}
      >
        <RouterOutlet />
        <ServiceWorkerRegister />
        <RealMetricsOptimization builderApiKey={BUILDER_PUBLIC_API_KEY} />
      </body>
    </QwikCityProvider>
  );
});
