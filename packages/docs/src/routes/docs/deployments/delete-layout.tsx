import { component$, Slot, useSignal } from '@qwik.dev/core';
import { ContentNav } from '../../../components/content-nav/content-nav';
import { Footer } from '../../../components/footer/footer';
import { Header } from '../../../components/header/header';
import { OnThisPage } from '../../../components/on-this-page/on-this-page';
import { Sidebar } from '../../../components/sidebar/sidebar';

export default component$(() => {
  const mobileSidebarOpen = useSignal(false);

  return (
    <div class="docs fixed-header">
      <Header mobileSidebarOpen={mobileSidebarOpen} />
      <Sidebar mobileOpen={mobileSidebarOpen} />
      <main
        class={{
          'no-right-menu': true,
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
