import { component$, Slot } from '@builder.io/qwik';
import Header from '../header/header';

export default component$(() => {
  return (
    <div class="container">
      <main>
        <Header />
        <section>
          <Slot />
        </section>
      </main>
      <footer>
        <a href="https://www.builder.io/" target="_blank">
          Made with ♡ by Builder.io
        </a>
      </footer>
    </div>
  );
});
