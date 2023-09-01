import { component$, Slot, useContext, useStyles$ } from '@builder.io/qwik';
import { useContent, useLocation } from '@builder.io/qwik-city';
import { ContentNav } from '../../components/content-nav/content-nav';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { createBreadcrumbs, SideBar } from '../../components/sidebar/sidebar';
import { GlobalStore } from '../../context';
import styles from './docs.css?inline';
import Contributors from '../../components/contributors';

export default component$(() => {
  const loc = useLocation();
  const noRightMenu = ['/docs/'].includes(loc.url.pathname);
  useStyles$(styles);
  const { menu } = useContent();
  const globalStore = useContext(GlobalStore);
  const { url } = useLocation();
  const breadcrumbs = createBreadcrumbs(menu, url.pathname);

  return (
    <div class="docs fixed-header">
      <Header />
      <nav class="breadcrumbs">
        <button
          onClick$={() => (globalStore.sideMenuOpen = !globalStore.sideMenuOpen)}
          type="button"
          title="Toggle left menu"
          aria-label="Toggle left menu"
        >
          <span class="sr-only">Navigation</span>
          <svg width="24" height="24">
            <path
              d="M5 6h14M5 12h14M5 18h14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
        {breadcrumbs.length > 0 ? (
          <ol>
            {breadcrumbs.map((b) => (
              <li>{b.text}</li>
            ))}
          </ol>
        ) : null}
      </nav>
      <SideBar />
      <main
        class={{
          'no-right-menu': noRightMenu,
        }}
      >
        <div class="docs-container">
          <article>
            <Slot />
            <Contributors />
          </article>
          <ContentNav />
          <Footer />
        </div>
        <OnThisPage />
      </main>
    </div>
  );
});
