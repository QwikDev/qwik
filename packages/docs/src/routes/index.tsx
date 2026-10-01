import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { Footer } from '~/components/footer/footer';
import { Header } from '~/components/header/header';
import { Home } from '~/components/home/home';
import GridStarBackground from '~/media/decor/grid-star-bg.svg?jsx';

export default component$(() => {
  return (
    <>
      <Header />
      <main class="bg-grid-stars">
        <GridStarBackground class="grid-star-background" />
        <Home.Hero />
        <Home.Streaming />
        <Home.Wip />
        <Home.Team />
      </main>
      <Footer />
    </>
  );
});

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
