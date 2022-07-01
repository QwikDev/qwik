import { component$, Host, Slot } from '@builder.io/qwik';
import Footer from '../../components/footer/footer';
import Header from '../../components/header/header';

export default component$(() => {
  return (
    <Host>
      <Header />
      <main class="dashboard">
        <aside class="dashboard-menu">Dashboard Menu</aside>
        <section class="dashboard-content">
          <Slot />
        </section>
      </main>
      <Footer />
    </Host>
  );
});
