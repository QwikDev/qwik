import { component$ } from '@qwik.dev/core';
import type { DocumentHead, RequestHandler } from '@qwik.dev/router';
import Streaming from '~/components/fixtures/streaming';

export const onGet: RequestHandler = ({ headers }) => {
  // The preview server's compression would hold the page back until the stream ends
  headers.set('Content-Encoding', 'identity');
};

export default component$(() => <Streaming />);

export const head: DocumentHead = { title: 'click while the page is still streaming' };
