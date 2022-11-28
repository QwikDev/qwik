import { component$ } from '@builder.io/qwik';
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <div>
      <h1>Catch All</h1>
      <p>
        <a href="/qwikcity-test/">Home</a>
      </p>
    </div>
  );
});

export const head: DocumentHead = () => {
  return {
    title: 'Catch All',
  };
};

export const onGet: RequestHandler = ({ url, abort }) => {
  if (url.pathname === '/qwikcity-test/catchall/') {
    // special case catchall
    return;
  }

  abort();
};
