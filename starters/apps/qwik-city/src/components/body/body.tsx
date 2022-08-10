import { component$ } from '@builder.io/qwik';
import { RouterOutlet } from '@builder.io/qwik-city';

export const Body = component$(() => {
  return (
    <body>
      <RouterOutlet />
    </body>
  );
});
