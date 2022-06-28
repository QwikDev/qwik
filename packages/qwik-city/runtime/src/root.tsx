import cityPlan from 'packages/qwik-city/runtime/qwik-city-plan';
import { Content, Html } from '../../dist';
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
