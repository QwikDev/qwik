import { useLocation } from '@qwik.dev/router';
import { component$, Slot, useStyles$ } from '@qwik.dev/core';
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
  const hasOnThisPage = loc.url.pathname !== '/docs/';

  return (
    <div class="docs fixed-header">
      <Header />
      <div class="flex items-stretch mx-auto bg-violet-shallow">
        <Sidebar />
        <main class="mx-auto">
          <div class="px-6 2xl:px-10 pt-8 2xl:pt-5 2xl:max-w-[850px]">
            <article>
              <Slot />
              <Contributors />
            </article>
            <ContentNav />
            <Footer />
          </div>
          {hasOnThisPage && <OnThisPage />}
        </main>
      </div>
    </div>
  );
});
