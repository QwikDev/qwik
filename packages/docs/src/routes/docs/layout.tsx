import { useLocation } from '@qwik.dev/router';
import { component$, Slot, useComputed$, useStyles$ } from '@qwik.dev/core';
import { ContentNav } from '../../components/content-nav/content-nav';
import Contributors from '../../components/contributors';
import { DocsSidebar, docsSidebarId } from '../../components/docs-sidebar/docs-sidebar';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import styles from './docs.css?inline';

export default component$(() => (
  <DocsShell>
    <Slot />
  </DocsShell>
));

const overviewPathnames = ['/docs/', '/api/'];

/** Shared by the /docs and /api layouts so both get the header, sidebar and TOC. */
export const DocsShell = component$((props: { class?: string; pagefindWeight?: number }) => {
  useStyles$(styles);
  const loc = useLocation();
  const hasOnThisPage = useComputed$(() => !overviewPathnames.includes(loc.url.pathname));

  return (
    <div class={['docs', props.class]}>
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
            <article
              class="docs-content"
              data-pagefind-body
              data-pagefind-weight={props.pagefindWeight}
            >
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
