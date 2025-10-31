import { component$, useContextProvider, useStore } from '@qwik.dev/core';
import { Insights } from '@qwik.dev/core/insights';
import { RouterOutlet, useQwikRouter } from '@qwik.dev/router';
import { RouterHead } from './components/router-head/router-head';
import { InjectThemeScript } from './components/theme-toggle';
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
  useQwikRouter();

  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
    theme: 'auto',
    pkgManager: 'pnpm',
  });

  useContextProvider(GlobalStore, store);

  return (
    <>
      <head>
        <meta charset="utf-8" />

        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="apple-mobile-web-app-title" content="Qwik" />
        <meta name="application-name" content="Qwik" />
        <meta name="apple-mobile-web-app-title" content="Qwik" />
        <meta name="theme-color" content="#006ce9" />
        <meta name="color-scheme" content="dark light" />

        <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
        <link rel="icon" href="/favicons/favicon.svg" type="image/svg+xml" />

        <RouterHead />

        <InjectThemeScript />
        <script dangerouslySetInnerHTML={uwu} />

        <script dangerouslySetInnerHTML={`(${collectSymbols})()`} />
        <Insights />
      </head>
      <body
        class={{
          'header-open': store.headerMenuOpen,
          'menu-open': store.sideMenuOpen,
        }}
      >
        {/* This renders the current route, including all Layout components. */}
        <RouterOutlet />
      </body>
    </>
  );
});

export function collectSymbols() {
  (window as any).symbols = [];
  document.addEventListener('qsymbol', (e) =>
    (window as any).symbols.push((e as any).detail.symbol)
  );
}
