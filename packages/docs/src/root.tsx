import { component$, useContextProvider, useStore, useStyles$ } from '@qwik.dev/core';
import { Insights } from '@qwik.dev/core/insights';
import { RouterOutlet, useQwikRouter } from '@qwik.dev/router';
import { RouterHead } from './components/router-head/router-head';
import { GlobalStore, type SiteStore } from './context';

import styles from './global.css?inline';

export default component$(() => {
  useQwikRouter();

  useStyles$(styles);

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
        {/* TODO: figure out what needs to be fixed on theme management. For now it should be light theme matching our design. */}
        {/* <meta name="color-scheme" content="dark light" /> */}

        <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
        <link rel="icon" href="/favicons/favicon.svg" type="image/svg+xml" />

        <RouterHead />

        <script dangerouslySetInnerHTML={`(${collectSymbols})()`} />
        <Insights />
      </head>
      <body>
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
