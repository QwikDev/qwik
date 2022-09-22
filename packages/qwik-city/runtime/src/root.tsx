import { QwikCity, RouterOutlet, ServiceWorkerRegister } from '~qwik-city-runtime';
import { RouterHead } from './app/components/router-head/router-head';
import './global.css';

export default function Root() {
  return (
    <QwikCity>
      <head>
        <meta charSet="utf-8" />
        <RouterHead />
      </head>
      <body>
        <RouterOutlet />
        <ServiceWorkerRegister />
      </body>
    </QwikCity>
  );
}
