import cityPlan from '@qwik-city-plan';
import { Html } from '@builder.io/qwik-city';
import Body from './components/body/body';
import Head from './components/head/head';
import './global.css';

export default function Root() {
  return (
    <Html lang="en" cityPlan={cityPlan}>
      <Head />
      <Body />
    </Html>
  );
}
