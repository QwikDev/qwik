import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';
import { SideBar } from '../../components/sidebar/sidebar';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { ContentNav } from '../../components/content-nav/content-nav';
import type { RequestHandler } from '@builder.io/qwik-city';
import { CommunityNavbar } from './components/community-navbar/community-navbar';
import styles from '../docs.css?inline';

export default component$(() => {
  const loc = useLocation();
  const noRightMenu = ['/community/showcase/', '/community/media/'].includes(loc.url.pathname);
  useStyles$(styles);

  return (
    <div class="docs fixed-header">
      <Header />
      <SideBar />
      {/* <CommunityNavbar/> */}
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

export const onGet: RequestHandler = ({ cacheControl }) => {
  cacheControl({
    public: true,
    maxAge: 3600,
    sMaxAge: 3600,
    staleWhileRevalidate: 86400,
  });
};
