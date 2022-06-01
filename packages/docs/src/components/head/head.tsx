import { partytownSnippet } from '@builder.io/partytown/integration';

export const Head = () => (
  <>
    <meta charSet="utf-8" />

    <title>Qwik</title>
    <meta name="viewport" content="width=device-width" />

    <link rel="dns-prefetch" href="https://cdn.jsdelivr.net/" />
    <link rel="dns-prefetch" href="https://cdn.builder.io/" />

    <link rel="apple-touch-icon" sizes="180x180" href="/favicons/apple-touch-icon.png" />
    <link rel="icon" href="/favicons/favicon.svg" type="image/svg+xml" />

    <meta name="apple-mobile-web-app-title" content="Qwik" />
    <meta name="application-name" content="Qwik" />
    <meta name="apple-mobile-web-app-title" content="MyApp" />
    <meta name="theme-color" content="#0093ee" />
    <link rel="manifest" href="/app.webmanifest" />

    <meta name="twitter:site" content="@QwikDev" />
    <meta name="twitter:creator" content="@QwikDev" />
    <meta name="twitter:card" content="summary_large_image" />

    <meta property="fb:app_id" content="676395883130092" />

    <meta property="og:url" content="https://qwik.builder.io/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Qwik" />
    <meta property="og:description" content="Qwik is Framework reimagined for the edge" />
    <meta
      property="og:image"
      content="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F56f46c6818704d47957a587157e2444f?width=1200"
    />
    <meta
      property="og:image:alt"
      content="Image of Qwik Framework Logo, Framework reimagined for the edge. Code snippet npm init qwik@latest"
    />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="QwikDev" />

    <script
      innerHTML={partytownSnippet({
        forward: ['dataLayer.push'],
      })}
    />
    <script
      type="text/partytown"
      innerHTML={`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-NR2STLN');`}
    />

    <script
      type="text/partytown"
      src="https://cdn.jsdelivr.net/npm/@builder.io/persist-attribution@0.0.1-beta-2/dist/persist-attribution.min.js"
      id="persist-attribution-init"
      data-send-page-view-events="true"
    />
  </>
);
