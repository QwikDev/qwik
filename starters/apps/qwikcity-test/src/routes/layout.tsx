import { component$, Slot, useTask$ } from '@builder.io/qwik';
import { RequestHandler, serverLoader$ } from '@builder.io/qwik-city';
import Footer from '../components/footer/footer';
import Header from '../components/header/header';

export const rootLoader = serverLoader$(() => {
  return {
    serverTime: new Date().toISOString(),
  };
});

export default component$(() => {
  const serverData = rootLoader.use();
  useTask$(({ track }) => {
    track(serverData);
    // run everytime it updates
  });
  return (
    <div data-test-layout="root">
      <Header />
      <div>{serverData.value.serverTime}</div>
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
