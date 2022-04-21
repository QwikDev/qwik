import { component$ } from '@builder.io/qwik';
import { Footer } from '../footer/footer';
import { Header } from '../header/header';

import './global.css';

export const App = component$(() => {
  return (
    <>
      <Header />
      <div>Hello Builder</div>
      <Footer />
    </>
  );
});
