import { component$, Host, Slot } from '@builder.io/qwik';
import Footer from '../components/footer/footer';
import Header from '../components/header/header';

export default component$(() => {
  return (
    <Host>
      <Header />
      <main>
        <Slot />
      </main>
      <Footer />
    </Host>
  );
});
