import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import { SideBar } from '../../components/sidebar/sidebar';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { ContentNav } from '../../components/content-nav/content-nav';
import styles from '../docs/docs.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <div class="docs fixed-header">
      <Header />
      <SideBar />
      <main>
        <div class="docs-container">
          <article>
            <Slot />
          </article>
          <ContentNav />
          <Footer />
        </div>
        <OnThisPage />
      </main>
    </div>
  );
});
