import { component$, Slot } from '@builder.io/qwik';
import { ContentNav } from '../../../components/content-nav/content-nav';
import { Footer } from '../../../components/footer/footer';
import { Header } from '../../../components/header/header';
import { OnThisPage } from '../../../components/on-this-page/on-this-page';
import { SideBar } from '../../../components/sidebar/sidebar';

export default component$(() => {
  return (
    <div class="docs fixed-header">
      <Header />
      <SideBar allOpen={true} />
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
