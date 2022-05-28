import { component$, Host, Slot, useScopedStyles$ } from '@builder.io/qwik';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './default.css?inline';

const DefaultLayout = component$(() => {
  useScopedStyles$(styles);

  return (
    <Host class="docs">
      <Header />
      <SideBar />
      <main>
        <article>
          <Slot />
          <Footer />
        </article>
      </main>
    </Host>
  );
});

export default DefaultLayout;
