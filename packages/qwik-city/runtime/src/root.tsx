import { QwikCity } from '~qwik-city-runtime';
import { Head } from './app/components/head/head';
import { Body } from './app/components/body/body';
import './global.css';

export default function Root() {
  return (
    <QwikCity>
      <Head />
      <Body />
    </QwikCity>
  );
}
