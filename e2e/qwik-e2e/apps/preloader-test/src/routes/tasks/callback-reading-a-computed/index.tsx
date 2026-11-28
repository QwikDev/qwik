import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import CallbackReadingAComputed from '~/components/fixtures/tasks/callback-reading-a-computed';

export default component$(() => <CallbackReadingAComputed />);

export const head: DocumentHead = {
  title: 'callback reading a computed that a task in the chain also reads',
};
