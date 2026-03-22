import { component$, Slot, useSignal, useStyles$ } from '@qwik.dev/core';
import { Sidebar } from '../../components/sidebar/sidebar';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { ContentNav } from '../../components/content-nav/content-nav';
import styles from '../docs/docs.css?inline';

export { useMarkdownItems } from '../../components/sidebar/sidebar';

export default component$(() => {
  useStyles$(styles);
  const mobileSidebarOpen = useSignal(false);

  return (
    <div class="docs fixed-header">
      <Header mobileSidebarOpen={mobileSidebarOpen} />
      <div class="flex gap-12 xl:gap-20 items-stretch content-container">
        <Sidebar mobileOpen={mobileSidebarOpen} />
        <main class="contents">
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
    </div>
  );
});
