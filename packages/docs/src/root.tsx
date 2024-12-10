import { component$, useContextProvider, useStore } from '@qwik.dev/core';
import { Insights } from '@qwik.dev/core/insights';
import { QwikRouterProvider, RouterOutlet, ServiceWorkerRegister } from '@qwik.dev/router';
import RealMetricsOptimization from './components/real-metrics-optimization/real-metrics-optimization';
import { RouterHead } from './components/router-head/router-head';
import { BUILDER_PUBLIC_API_KEY } from './constants';
import { GlobalStore, type SiteStore } from './context';
import './global.css';

export const uwu = /*javascript*/ `
;(function () {
  try {
    var preferredUwu;
    try {
      preferredUwu = localStorage.getItem('uwu');
    } catch (err) { }

    const isUwuValue = window.location
      && window.location.search
      && window.location.search.match(/uwu=(true|false)/);

    if (isUwuValue) {
      const isUwu = isUwuValue[1] === 'true';
      if (isUwu) {
        try {
          localStorage.setItem('uwu', true);
        } catch (err) { }
        document.documentElement.classList.add('uwu');
        console.log('uwu mode enabled. turn off with ?uwu=false')
        console.log('logo credit to @sawaratsuki1004 via https://github.com/SAWARATSUKI/ServiceLogos');
      } else {
        try {
          localStorage.removeItem('uwu', false);
        } catch (err) { }
      }
    } else if (preferredUwu) {
      document.documentElement.classList.add('uwu');
    }
  } catch (err) { }
})();
`;

export default component$(() => {
  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
    theme: 'auto',
  });

  useContextProvider(GlobalStore, store);

  return (
    <QwikRouterProvider>
      <head>
        <meta charset="utf-8" />
        <script dangerouslySetInnerHTML={uwu} />
        <RouterHead />
        <ServiceWorkerRegister />

        <script dangerouslySetInnerHTML={`(${collectSymbols})()`} />
        <Insights publicApiKey={import.meta.env.PUBLIC_QWIK_INSIGHTS_KEY} />
      </head>
      <body
        class={{
          'header-open': store.headerMenuOpen,
          'menu-open': store.sideMenuOpen,
        }}
      >
        <RouterOutlet />
        <RealMetricsOptimization builderApiKey={BUILDER_PUBLIC_API_KEY} />
        {/* Core Web Vitals experiment until November 8: Do not bring back any SW until then! Reach out to @maiieul first if you believe you have a good reason to change this. */}
      </body>
    </QwikRouterProvider>
  );
});

export function collectSymbols() {
  (window as any).symbols = [];
  document.addEventListener('qsymbol', (e) => (window as any).symbols.push((e as any).detail));
}
