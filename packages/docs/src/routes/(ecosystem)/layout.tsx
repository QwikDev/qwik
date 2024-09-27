import { component$, Slot } from '@qwikdev/core';
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
