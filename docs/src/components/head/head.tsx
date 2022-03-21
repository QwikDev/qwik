import { partytownSnippet } from '@builder.io/partytown/integration';

export const Head = () => (
  <>
    <meta charSet="utf-8" />

    <title>Qwik</title>
    <meta name="viewport" content="width=device-width" />

    <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
    <link rel="icon" href="/favicons/favicon.svg" type="image/svg+xml" />

    <meta name="viewport" content="width=device-width" />
    <meta name="apple-mobile-web-app-title" content="Qwik" />
    <meta name="application-name" content="Qwik" />
    <meta name="theme-color" content="#ffffff" />

    <meta name="twitter:site" content="@QwikDev" />
    <meta name="twitter:creator" content="@QwikDev" />
    <meta name="twitter:description" content="Web Framework focusing on Time-to-Interactive." />
    <meta name="twitter:card" content="summary" />

    <script innerHTML={partytownSnippet()} />
    <script type="text/partytown">console.debug("🎉");</script>
  </>
);
