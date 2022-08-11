import { component$ } from '@builder.io/qwik';
import { Html, RouterOutlet } from '@builder.io/qwik-city';
import { Head } from './components/head/head';

import './global.css';

export default component$(() => {
  return (
    <Html>
      <Head />
      <body lang="en">
        <RouterOutlet />
      </body>
    </Html>
  );
});
