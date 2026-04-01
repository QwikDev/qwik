import { useLocation } from '@qwik.dev/router';
import { component$, Slot, useComputed$, useSignal, useStyles$ } from '@qwik.dev/core';
import { ContentNav } from '../../components/content-nav/content-nav';
import Contributors from '../../components/contributors';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { Sidebar } from '../../components/sidebar/sidebar';
import styles from './docs.css?inline';

export { useMarkdownItems } from '../../components/sidebar/sidebar';

export default component$(() => {
  useStyles$(styles);
  const loc = useLocation();
  const isOverview = useComputed$(() => loc.url.pathname === '/docs/');
  const hasOnThisPage = useComputed$(() => !isOverview.value);
  const mobileSidebarOpen = useSignal(false);

  return (
    <div class="docs">
      <Header mobileSidebarOpen={mobileSidebarOpen} />
      <div class="docs-grid bg-violet-shallow">
        <Sidebar mobileOpen={mobileSidebarOpen} />
        <main
          class={{
            'docs-content-area pb-10 fixed-header': true,
            'docs-content-area-wide': isOverview.value,
          }}
        >
          <div class="docs-content">
            <article>
              <Slot />
              <Contributors />
            </article>
            <ContentNav />
          </div>
          {hasOnThisPage.value && <OnThisPage />}
        </main>
        <Footer />
      </div>
    </div>
  );
});
