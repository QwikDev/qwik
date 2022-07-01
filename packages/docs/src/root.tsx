import cityPlan from '@qwik-city-plan';
import { Content, Html } from '@builder.io/qwik-city';
import { Head } from './components/head/head';
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
