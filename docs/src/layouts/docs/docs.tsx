import { component$, Host, Slot, useScopedStyles$ } from '@builder.io/qwik';
import type { SiteStore } from '../../components/app/app';
import { ContentNav } from '../../components/content-nav/content-nav';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './docs.css?inline';

interface DocsLayoutProps {
  store: SiteStore;
}

const DocsLayout = component$((props: DocsLayoutProps) => {
  useScopedStyles$(styles);

  return (
    <Host class="docs">
      <Header store={props.store} />
      <SideBar store={props.store} />
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

export default DocsLayout;
