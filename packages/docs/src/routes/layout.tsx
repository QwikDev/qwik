import { component$, Slot } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';
import { Header } from '../components/header/header';
import { Footer } from '../components/footer/footer';

export default component$(() => {
  return (
    <>
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
