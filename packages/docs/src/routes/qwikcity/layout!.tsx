import { component$, Slot, useStyles$ } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';
import { ContentNav } from '../../components/content-nav/content-nav';
import { Footer } from '../../components/footer/footer';
import { Header } from '../../components/header/header';
import { OnThisPage } from '../../components/on-this-page/on-this-page';
import { SideBar } from '../../components/sidebar/sidebar';
import styles from '../docs/docs.css?inline';
import BuilderContentComp from '../../components/builder-content';
import { BUILDER_MODEL, BUILDER_PUBLIC_API_KEY } from '../../constants';

export default component$(() => {
  useStyles$(styles);

  return (
    <div class="docs fixed-header">
      <BuilderContentComp
        apiKey={BUILDER_PUBLIC_API_KEY}
        model={BUILDER_MODEL}
        tag="div"
        fixed={true}
      />
      <Header />
      <SideBar />
      <main>
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
