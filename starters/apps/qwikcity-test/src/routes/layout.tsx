import { component$, Slot } from '@builder.io/qwik';
import { RequestHandler, serverLoader$ } from '@builder.io/qwik-city';
import Footer from '../components/footer/footer';
import Header from '../components/header/header';
import { isUserAuthenticated } from '../auth/auth';

export const rootLoader = serverLoader$(() => {
  return {
    serverTime: new Date().toISOString(),
    nodeVersion: process.version,
  };
});

export const userLoader = serverLoader$(async ({ cookie }) => {
  return {
    isAuthenticated: await isUserAuthenticated(cookie),
  };
});

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

export const onGet: RequestHandler = ({ headers }) => {
  // cache for a super long time of 10 seconds for pages using this layout
  headers.set('Cache-Control', 'max-age=10');
};
