/* eslint-disable no-console */
import { component$ } from '@builder.io/qwik';
import { type DocumentHead } from '@builder.io/qwik-city';
import { QCounter } from '~/components/counter';

export default component$(() => {
  return (
    <QCounter
      onMount$={() => console.log('@@@@ Mount')}
      onUnmount$={() => console.log('@@@@ Unmount')}
    />
  );
});

export const head: DocumentHead = {
  title: 'Welcome to React Qwik',
  meta: [
    {
      name: 'description',
      content: 'React Qwik site description',
    },
  ],
};
