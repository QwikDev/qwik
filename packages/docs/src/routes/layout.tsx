import { component$, Slot } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';
import { Header } from '../components/header/header';
import { Footer } from '../components/footer/footer';
import BuilderContentComp from '../components/builder-content';
import { BUILDER_MODEL, BUILDER_PUBLIC_API_KEY } from '../constants';

export default component$(() => {
  return (
    <>
      <BuilderContentComp apiKey={BUILDER_PUBLIC_API_KEY} model={BUILDER_MODEL} tag="div" />
      <Header />
      <main>
        <Slot />
      </main>
      <Footer />
    </>
  );
});

export const onGet: RequestHandler = ({ cacheControl }) => {
  // cache for pages using this layout
  cacheControl({
    public: true,
    maxAge: 3600,
    sMaxAge: 3600,
    staleWhileRevalidate: 86400,
  });
};
