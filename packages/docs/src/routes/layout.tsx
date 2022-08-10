import { component$, Host, Slot } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';
import { Header } from '../components/header/header';
import { Footer } from '../components/footer/footer';

export default component$(() => {
  return (
    <Host>
      <Header />
      <main>
        <Slot />
      </main>
      <Footer />
    </Host>
  );
});

export const onGet: RequestHandler = ({ response }) => {
  // cache for pages using this layout
  response.headers.set(
    'Cache-Control',
    'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
  );
};
