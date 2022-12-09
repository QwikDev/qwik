import { component$, Slot } from '@builder.io/qwik';
import { RequestHandler, serverLoader$ } from '@builder.io/qwik-city';
import Footer from '../components/footer/footer';
import Header from '../components/header/header';

export const rootLoader = serverLoader$((r) => {
  return {
    serverTime: new Date().toISOString(),
  };
});

export default component$(() => {
  const { value } = rootLoader.use();
  return (
    <div data-test-layout="root">
      <Header />
      <div>{value.serverTime}</div>
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
