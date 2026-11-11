import { component$, Slot } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import { FillerAbove } from '~/components/filler/filler-above';
import { FillerBelow } from '~/components/filler/filler-below';
import { Sidebar } from '~/components/sidebar/sidebar';

export default component$(() => {
  return (
    <div class="app">
      <Sidebar />
      <main class="main">
        <FillerAbove />
        <Slot />
        <div class="spacer" />
        <FillerBelow />
      </main>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Preloader Test',
};
