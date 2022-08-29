import { QwikCity, RouterOutlet, ServiceWorkerRegister } from '~qwik-city-runtime';
import { Head } from './app/components/head/head';
import './global.css';

export default function Root() {
  return (
    <QwikCity>
      <Head />
      <body>
        <RouterOutlet />
        <ServiceWorkerRegister />
      </body>
    </QwikCity>
  );
}
