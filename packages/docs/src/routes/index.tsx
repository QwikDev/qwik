import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
// import { Header } from '../components/header/header';

export default component$(() => {
  return (
    <>
      {/* <Header /> */}
      <main>
        <div class="space-y-10 *:mx-auto">
          <h1 class="uppercase font-display text-h2 max-w-[15ch] text-center">
            Automatically <span class="text-violet-75">Instant</span> Web Apps
          </h1>
          <p class="font-body text-body-md max-w-[50ch] text-center">
            A new kind of framework for you to ship quicker and provide better user experiences
            every step of the way.
          </p>
        </div>
      </main>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
