import cityPlan from '@qwik-city-plan';
import { Content, Html } from '~qwik-city-runtime';
import { Head } from './app/components/head/head';
import './global.css';

export default function Root() {
  return (
    <Html lang="en" cityPlan={cityPlan}>
      <Head />
      <body>
        <Content />
      </body>
    </Html>
  );
}
