import { component$, Slot, useContext, useStyles$ } from '@builder.io/qwik';
import { useContent, useLocation } from '@builder.io/qwik-city';
import { ContentNav } from '../../components/content-nav/content-nav';
import Contributors from '../../components/contributors';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { createBreadcrumbs, SideBar } from '../../components/sidebar/sidebar';
import { GlobalStore } from '../../context';
import styles from './docs.css?inline';

export { useMarkdownItems } from '../../components/sidebar/sidebar';

export default component$(() => {
  useStyles$(styles);
  const loc = useLocation();
  // hide OnThisPage on docs overview page; only show on sub-pages
  const hasOnThisPage = loc.url.pathname !== '/docs/';
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
            {breadcrumbs.map((b, key) => (
              <li key={key}>{b.text}</li>
            ))}
          </ol>
        ) : null}
      </nav>
      <div class="flex gap-12 xl:gap-20 items-stretch content-container">
        <SideBar />
        <main class="contents">
          <div class="docs-container">
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
