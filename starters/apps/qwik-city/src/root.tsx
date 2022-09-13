import { QwikCity, RouterOutlet, ServiceWorkerRegister } from '@builder.io/qwik-city';
import { Head } from './components/head/head';

import './global.css';

export default function () {
  return (
    <QwikCity>
      <Head />
      <body lang="en">
        <RouterOutlet />
        <ServiceWorkerRegister />
      </body>
    </QwikCity>
  );
}
