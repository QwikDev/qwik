import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { Footer } from '~/components/footer/footer';
import { Header } from '~/components/header/header';
import { Home } from '~/components/home/home';
import gridStarBgUrl from '~/media/decor/grid-star-bg.svg?url';

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
  links: [
    {
      rel: 'preload',
      as: 'image',
      href: gridStarBgUrl,
      type: 'image/svg+xml',
      fetchPriority: 'high',
    },
  ],
};
