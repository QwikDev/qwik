import { component$, useContextProvider, useStore, useVisibleTask$ } from '@builder.io/qwik';
import { QwikCityProvider, RouterOutlet, ServiceWorkerRegister } from '@builder.io/qwik-city';
import RealMetricsOptimization from './components/real-metrics-optimization/real-metrics-optimization';
import { RouterHead } from './components/router-head/router-head';
import { GlobalStore, type SiteStore } from './context';
import './global.css';
import { BUILDER_PUBLIC_API_KEY } from './constants';
import { Insights } from '@builder.io/qwik-labs';

export default component$(() => {
  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
    theme: 'auto',
  });

  useContextProvider(GlobalStore, store);

  useVisibleTask$(({ cleanup }) => {
    const listener = document.body.addEventListener('click', async (event: any) => {
      if (event && event.target.classList.contains('copy-button')) {
        // Handle the button click here
        const codeNode = event.target.previousElementSibling;
        if (codeNode && codeNode.tagName === 'DIV') {
          const code = codeNode.lastElementChild.innerText;
          await navigator.clipboard.writeText(code);
        }
      }
    });

    cleanup(() => document.body.removeEventListener('click', listener));
  });

  return (
    <QwikCityProvider>
      <head>
        <meta charSet="utf-8" />
        <RouterHead />
        <ServiceWorkerRegister />
        {/* <script dangerouslySetInnerHTML={`(${collectSymbols})()`} /> */}
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
      </body>
    </QwikCityProvider>
  );
});

export function collectSymbols() {
  (window as any).symbols = [];
  document.addEventListener('qsymbol', (e) => (window as any).symbols.push((e as any).detail));
}
