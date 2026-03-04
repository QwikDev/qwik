import { component$ } from '@qwik.dev/core';
import { type DocumentHead } from '@qwik.dev/router';
// import { Header } from '../components/header/header';

export default component$(() => {
  return (
    <>
      {/* <Header /> */}
      <main>
        <h1 class="uppercase">Automatically Instant Web Apps</h1>
        <p>
          A new kind of framework for you to ship quicker and provide better user experiences every
          step of the way.
        </p>
      </main>
    </>
  );
});

export const head: DocumentHead = {
  title: 'Framework reimagined for the edge!',
};
