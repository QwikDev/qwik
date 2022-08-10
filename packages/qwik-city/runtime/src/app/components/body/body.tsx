import { component$ } from '@builder.io/qwik';
import { RouterOutlet } from '~qwik-city-runtime';

export const Body = component$(() => {
  return (
    <body>
      <RouterOutlet />
    </body>
  );
});
