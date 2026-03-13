import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { Header } from '~/components/header/header';
import { Home } from '~/components/home/home';

export default component$(() => {
  return (
    <>
      <Header />
      <main>
        <Home.Hero />
        <Home.Streaming />
      </main>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
