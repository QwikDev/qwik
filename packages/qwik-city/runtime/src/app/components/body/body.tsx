import { component$, Host } from '@builder.io/qwik';
import { RouterOutlet } from '~qwik-city-runtime';

export const Body = component$(
  () => {
    return (
      <Host>
        <RouterOutlet />
      </Host>
    );
  },
  { tagName: 'body' }
);
