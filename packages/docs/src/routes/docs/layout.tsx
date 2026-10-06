import { useLocation } from '@qwik.dev/router';
import { component$, Slot, useComputed$, useStyles$ } from '@qwik.dev/core';
import { ContentNav } from '../../components/content-nav/content-nav';
import Contributors from '../../components/contributors';
import {
  DocsSidebar,
  docsSidebarId,
} from '../../components/docs-sidebar/docs-sidebar';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import styles from './docs.css?inline';

export default component$(() => {
  useStyles$(styles);
  const loc = useLocation();
  const hasOnThisPage = useComputed$(() => loc.url.pathname !== '/docs/');

  return (
    <div class="docs">
      <Header sidebarId={docsSidebarId} />
      <div class="docs-grid bg-background-base">
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
            <article class="docs-content" data-pagefind-body>
              <Slot />
              <div data-pagefind-ignore>
                <Contributors />
              </div>
            </article>
            <ContentNav />
          </main>
        </div>
        <DocsSidebar />
        <Footer />
      </div>
    </div>
  );
});
