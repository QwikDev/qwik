import { component$ } from '@builder.io/qwik';
import { type DocumentHead } from '@builder.io/qwik-city';
import ClickMe from '~/components/click-me/click-me';

export default component$(() => {
  return (
    <>
      <a href="/profile">go to profile</a>
      <br />
      <h1>Home page</h1>
      <br />
      {/* We need to extract the component to see the bug on 1.5.7 */}
      <ClickMe />
    </>
  );
});

export const head: DocumentHead = {
  title: 'Welcome to Qwik',
  meta: [
    {
      name: 'description',
      content: 'Qwik site description',
    },
  ],
};
