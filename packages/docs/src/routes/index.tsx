import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { Footer } from '~/components/footer/footer';
import { Header } from '~/components/header/header';
import { Home } from '~/components/home/home';

export default component$(() => {
  return (
    <>
      <Header />
      <main class="bg-grid-stars">
        <Home.Hero />
        <Home.Streaming />
      </main>
      <Footer />
    </>
  );
});

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
