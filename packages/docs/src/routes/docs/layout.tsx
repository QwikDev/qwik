import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';
import { ContentNav } from '../../components/content-nav/content-nav';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './docs.css?inline';

export default component$(() => {
  const loc = useLocation();
  const noRightMenu = ['/docs/'].includes(loc.url.pathname);
  useStyles$(styles);

  return (
    <div class="docs fixed-header">
      <Header />
      <SideBar />
      <main
        class={{
          'no-right-menu': noRightMenu,
        }}
      >
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
