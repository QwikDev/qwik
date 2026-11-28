import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import HandlerReadingAComputed from '~/components/fixtures/computeds/handler-in-a-list';

export default component$(() => <HandlerReadingAComputed />);

export const head: DocumentHead = {
  title: 'a click handler reading a computed from another component',
};
