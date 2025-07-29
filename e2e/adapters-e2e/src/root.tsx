import { component$ } from '@qwik.dev/core';
import { QwikRouterProvider, RouterOutlet } from '@qwik.dev/router';
import { RouterHead } from './components/router-head/router-head';

export default component$(() => {
  /**
   * The root of a QwikCity site always start with the <QwikCityProvider> component, immediately
   * followed by the document's <head> and <body>.
   *
   * Don't remove the `<head>` and `<body>` elements.
   */

  return (
    <QwikRouterProvider>
      <head>
        <meta charset="utf-8" />
        <RouterHead />
      </head>
      <body lang="en">
        <RouterOutlet />
      </body>
    </QwikRouterProvider>
  );
});
