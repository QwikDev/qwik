import { component$, Slot } from '@qwik.dev/core';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';

export default component$(() => {
  return (
    <>
      <Header />
      <main>
        <Slot />
      </main>
      <div class="px-4">
        <Footer />
      </div>
    </>
  );
});
