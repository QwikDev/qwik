/* eslint-disable no-console */
import {
  component$,
  useContextProvider,
  useSignal,
  useStore,
  useTask$,
  type Signal,
} from '@builder.io/qwik';
import {
  QwikCityProvider,
  RouterOutlet,
  ServiceWorkerRegister,
  useLocation,
} from '@builder.io/qwik-city';
import { Insights } from '@builder.io/qwik-labs';
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

  const limitSig = useSignal(100);

  useTask$(({ track }) => {
    track(() => limitSig.value);
    console.log('root limit: ', limitSig.value);
  });
  return (
    <QwikCityProvider prefetchLimit={limitSig.value}>
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
        <LimitComponent limit={limitSig} />
        <RealMetricsOptimization builderApiKey={BUILDER_PUBLIC_API_KEY} />
      </body>
    </QwikCityProvider>
  );
});

export function collectSymbols() {
  (window as any).symbols = [];
  document.addEventListener('qsymbol', (e) => (window as any).symbols.push((e as any).detail));
}

const LimitComponent = component$<{ limit: Signal<number> }>(({ limit }) => {
  const location = useLocation();
  console.log(location.url.searchParams.get('limit'));

  useTask$(() => {
    limit.value = parseInt(location.url.searchParams.get('limit') || '100');
  });
  return (
    <>
      <div>{location.url.pathname}</div>
      <div>{limit.value}</div>;
    </>
  );
});
