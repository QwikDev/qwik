import './global.css';
import { component$ } from '@qwik.dev/core';
import { QwikCityProvider, RouterOutlet, ServiceWorkerRegister } from '@qwik.dev/city';
import { Insights } from '@builder.io/qwik-labs';
import { RouterHead } from './components/router-head/router-head';
export default component$(() => {
  return (
    <QwikCityProvider>
      <head>
        <meta charset="utf-8" />
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
