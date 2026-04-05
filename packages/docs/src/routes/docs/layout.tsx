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
  const hasOnThisPage = useComputed$(() => loc.url.pathname !== '/docs/');
  const mobileSidebarOpen = useSignal(false);

  return (
    <div class="docs">
      <Header mobileSidebarOpen={mobileSidebarOpen} />
      <div class="docs-grid bg-violet-shallow">
        <Sidebar mobileOpen={mobileSidebarOpen} />
        <div class="docs-shell fixed-header">
          {hasOnThisPage.value && (
            <div class="docs-toc">
              <OnThisPage />
            </div>
          )}
          <main
            class={{
              'docs-main': true,
              'docs-main-full': !hasOnThisPage.value,
            }}
          >
            <article class="docs-content">
              <Slot />
              <Contributors />
            </article>
            <ContentNav />
          </main>
        </div>
        <Footer />
      </div>
    </div>
  );
});
