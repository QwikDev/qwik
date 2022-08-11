import { QwikCity } from '@builder.io/qwik-city';
import { Head } from './components/head/head';
import { Body } from './components/body/body';
import './global.css';

export default function Root() {
  return (
    <QwikCity>
      <Head />
      <Body />
    </QwikCity>
  );
}
