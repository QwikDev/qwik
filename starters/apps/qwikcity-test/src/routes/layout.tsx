import { component$, Slot } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';
import Footer from '../components/footer/footer';
import Header from '../components/header/header';

export default component$(() => {
  return (
    <div data-test-layout="root">
      <Header />
      <main>
        <Slot />
      </main>
      <Footer />
    </div>
  );
});

export const onGet: RequestHandler = ({ response }) => {
  // cache for a super long time of 10 seconds for pages using this layout
  response.headers.set('Cache-Control', 'max-age=10');
};
