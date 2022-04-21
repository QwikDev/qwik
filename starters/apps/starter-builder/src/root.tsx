import { component$ } from '@builder.io/qwik';
import { Footer } from './components/footer/footer';
import { Header } from './components/header/header';

import './global.css';

export const Main = component$(() => {
  return (
    <>
      <Header />
      <div>Hello Builder</div>
      <Footer />
    </>
  );
});
