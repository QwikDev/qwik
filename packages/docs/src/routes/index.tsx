import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
import { Button } from '~/components/button/button';
import { lucide } from '@qds.dev/ui';
// import { Header } from '../components/header/header';

export default component$(() => {
  return (
    <>
      {/* <Header /> */}
      <main>
        <Decor />
        <section class="space-y-10 *:mx-auto">
          <h1 class="uppercase font-display text-h2 max-w-[15ch] text-center">
            Automatically <span class="text-violet-75">Instant</span> Web Apps
          </h1>
          <p class="text-body-md max-w-[50ch] text-center">
            A new kind of framework for you to ship quicker and provide better user experiences
            every step of the way.
          </p>
          <div class="flex gap-6 justify-center">
            <Button variant="primary">
              <span>Qwik Start</span>
              <lucide.arrowright />
            </Button>

            <Button variant="secondary">
              <span>npm create qwik@latest</span>
              <lucide.clipboard />
            </Button>
          </div>
        </section>
      </main>
    </>
  );
});

export const Decor = component$(() => {
  return (
    <>
      {/* blue gradient */}
      <div class="fixed top-[20%] h-screen w-screen bg-hero-gradient-blue mix-blend-color -z-1 lg:-left-1/2 lg:-top-[20%]" />

      {/* purple gradient */}
      <div class="fixed -top-[10%] -right-[40%] h-screen w-screen bg-hero-gradient-purple mix-blend-color -z-1 lg:-right-1/2" />

      {/* star background */}
      <div aria-hidden="true" class="absolute inset-0 -z-2 bg-grid-stars" />
    </>
  );
});

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
