import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import { ContentNav } from '../../../components/content-nav/content-nav';
import { Footer } from '../../../components/footer/footer';
import { Header } from '../../../components/header/header';
import { SideBar } from '../../../components/sidebar/sidebar';
import styles from './docs/docs.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <div class="docs fixed-header">
      <Header />
      <SideBar allOpen={true} />
      <main
        class={{
          'no-right-menu': true,
        }}
      >
        <div class="docs-container">
          <article>
            <Slot />
          </article>
          <ContentNav />
          <Footer />
        </div>
      </main>
    </div>
  );
});
