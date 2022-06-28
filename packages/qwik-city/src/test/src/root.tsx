import { routes } from '@qwik-city-app';
import { Content, Html } from '@builder.io/qwik-city';
import { Head } from './components/head/head';
import './global.css';

export default function Root() {
  return (
    <Html lang="en" routes={routes}>
      <Head />
      <body>
        <Content />
      </body>
    </Html>
  );
}
