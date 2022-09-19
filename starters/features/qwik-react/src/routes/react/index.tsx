import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { MUIButton } from '~/integrations/react/button';

export default component$(() => {
  return (
    <div>
      <h1>The component below is a React MUI button:</h1>
      <MUIButton />
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Qwik React',
};
