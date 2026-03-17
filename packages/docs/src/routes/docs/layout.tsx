import { useLocation } from '@qwik.dev/router';
import { component$, Slot, useComputed$, useStyles$ } from '@qwik.dev/core';
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

  return (
    <div class="docs fixed-header">
      <Header />
      <div class="docs-grid bg-violet-shallow">
        <Sidebar />
        <div class="docs-content-area pb-10">
          <main>
            <div class={`docs-content ${isOverview.value ? 'docs-content-wide' : ''}`}>
              <article>
                <Slot />
                <Contributors />
              </article>
              <ContentNav />
            </div>
          </main>
          {hasOnThisPage.value && <OnThisPage />}
        </div>
        <Footer />
      </div>
    </div>
  );
});
