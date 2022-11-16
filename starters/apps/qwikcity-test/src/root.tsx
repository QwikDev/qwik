import { QwikCity, RouterOutlet } from '@builder.io/qwik-city';
import { RouterHead } from './components/router-head/router-head';
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
      </body>
    </QwikCity>
  );
}
