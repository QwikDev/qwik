import { Content, Html } from '@builder.io/qwik-city';
import cityPlan from '@qwik-city-plan';
import { Head } from './components/head/head';

import './global.css';

export default () => {
  return (
    <Html lang="en" cityPlan={cityPlan}>
      <Head />
      <body>
        <Content />
      </body>
    </Html>
  );
};
