import './global.css';

import { QwikCityProvider, RouterOutlet, ServiceWorkerRegister } from '@builder.io/qwik-city';
import { component$ } from '@builder.io/qwik';

import { Insights } from '@builder.io/qwik-labs';
import { RouterHead } from './components/router-head/router-head';

export default component$(() => {
  return (
    <QwikCityProvider>
      <head>
        <meta charSet="utf-8" />
        <link rel="manifest" href="/manifest.json" />
        <RouterHead />
        <Insights
          publicApiKey={import.meta.env.PUBLIC_QWIK_INSIGHTS_KEY}
          postUrl="/api/v1/${publicApiKey}/post/"
        />
      </head>
      <body lang="en">
        <RouterOutlet />
        <ServiceWorkerRegister />
      </body>
    </QwikCityProvider>
  );
});
