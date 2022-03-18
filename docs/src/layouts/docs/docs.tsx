import { $, component$, Host, Slot, useScopedStyles$ } from '@builder.io/qwik';
import { ContentNav } from '../../components/content-nav/content-nav';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from './docs.css';

const DocsLayout = component$(() => {
  useScopedStyles$(styles);

  return $(() => {
    return (
      <Host class="docs">
        <Header />
        <main class="mx-auto mt-14 min-h-[100vh] xl:max-w-[1400px]">
          <SideBar />
          <article class="xl:max-w-none xl:ml-[19rem] xl:mr-[16.5rem] xl:pr-16 xl:pt-5 content">
            <Slot />
            <ContentNav />
            <Footer />
          </article>
          <OnThisPage />
        </main>
      </Host>
    );
  });
});

export default DocsLayout;
