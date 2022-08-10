import { component$, Host, Slot, useStyles$ } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';
import { ContentNav } from '../../components/content-nav/content-nav';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './docs.css?inline';

export default component$(() => {
  useStyles$(styles);

  return (
    <Host class="docs fixed-header">
      <Header />
      <SideBar />
      <main>
        <article>
          <Slot />
          <ContentNav />
          <Footer />
        </article>
        <OnThisPage />
      </main>
    </Host>
  );
});

export const onGet: RequestHandler = ({ response }) => {
  // cache for pages using this layout
  response.headers.set(
    'Cache-Control',
    'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
  );
};
