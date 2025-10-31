import { component$, untrack, useContextProvider, useStore } from '@qwik.dev/core';
import { Insights } from '@qwik.dev/core/insights';
import {
  DocumentHeadTags,
  RouterOutlet,
  useDocumentHead,
  useLocation,
  useQwikRouter,
} from '@qwik.dev/router';
import RealMetricsOptimization from './components/real-metrics-optimization/real-metrics-optimization';
import { Social } from './components/router-head/social';
import { Vendor } from './components/router-head/vendor';
import { InjectThemeScript } from './components/theme-toggle';
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
  useQwikRouter();
  const head = useDocumentHead();
  const { url } = useLocation();
  const href = head.frontmatter?.canonical || untrack(() => url.href);

  const store = useStore<SiteStore>({
    headerMenuOpen: false,
    sideMenuOpen: false,
    theme: 'auto',
    pkgManager: 'pnpm',
  });

  useContextProvider(GlobalStore, store);

  const title = head.title
    ? `${head.title} 📚 Qwik Documentation`
    : `Qwik - Framework reimagined for the edge`;
  const description =
    head.meta.find((m) => m.name === 'description')?.content ||
    `No hydration, auto lazy-loading, edge-optimized, and fun 🎉!`;

  const OGImage = {
    imageURL: '',
    ogImgTitle: '',
    ogImgSubTitle: '' as string | undefined,

    get URL() {
      //turn the title into array with [0] -> Title [1] -> subTitle
      const arrayedTitle = title.split(' | ');
      const ogImageUrl = new URL('https://opengraphqwik.vercel.app/api/og?level=1');

      // biggerTitle
      this.ogImgTitle = arrayedTitle[0];
      //smallerTitle
      this.ogImgSubTitle = arrayedTitle[1]
        ? arrayedTitle[1].replace(' 📚 Qwik Documentation', '')
        : undefined;

      //decide whether or not to show dynamic OGimage or use docs default social card
      if (this.ogImgSubTitle == undefined || this.ogImgTitle == undefined) {
        this.imageURL = new URL(`/logos/social-card.jpg`, url).href;

        return this.imageURL;
      } else {
        ogImageUrl.searchParams.set('title', this.ogImgTitle);
        ogImageUrl.searchParams.set('subtitle', this.ogImgSubTitle);
        // ogImageUrl.searchParams.set('level', this.routeLevel.toString());

        this.imageURL = ogImageUrl.toString();

        return this.imageURL;
      }
    },
  };

  return (
    <>
      <head>
        <meta charset="utf-8" />

        <meta name="description" content={description} />
        <link rel="canonical" href={href} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="apple-mobile-web-app-title" content="Qwik" />
        <meta name="application-name" content="Qwik" />
        <meta name="apple-mobile-web-app-title" content="Qwik" />
        <meta name="theme-color" content="#006ce9" />
        <meta name="color-scheme" content="dark light" />

        <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
        <link rel="icon" href="/favicons/favicon.svg" type="image/svg+xml" />

        {import.meta.env.PROD && (
          <>
            <Social title={title} description={description} href={href} ogImage={OGImage.URL} />
            <Vendor />
          </>
        )}

        <DocumentHeadTags
          title={title}
          // Skip description because that was already added at the top
          meta={head.meta.filter((s) => s.name !== 'description')}
        />

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
        <RealMetricsOptimization builderApiKey={BUILDER_PUBLIC_API_KEY} />
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
