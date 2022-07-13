import { Content, Html } from '@builder.io/qwik-city';
import { Head } from './components/head/head';

import './global.css';

export default () => {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Content />
      </body>
    </Html>
  );
};
