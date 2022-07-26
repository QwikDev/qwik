import { component$, Host, Slot, useStyles$ } from '@builder.io/qwik';
import type { DocumentHead } from '~qwik-city-runtime';
import { Breadcrumbs } from '../../../components/breadcrumbs/breadcrumbs';
import Footer from '../../../components/footer/footer';
import Header from '../../../components/header/header';
import { Menu } from '../../../components/menu/menu';
import styles from './index.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <Host class="docs full-screen" data-test-layout="docs">
      <Header />
      <main>
        <Menu />
        <section class="docs-content">
          <Breadcrumbs />
          <Slot />
          <Footer />
        </section>
      </main>
    </Host>
  );
});

export const head: DocumentHead = ({ head }) => {
  return {
    title: `Docs: ${head.title}`,
  };
};
