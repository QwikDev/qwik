import { component$, Host } from '@builder.io/qwik';
import { RouterOutlet } from '@builder.io/qwik-city';

export const Body = component$(
  () => {
    return (
      <Host>
        <RouterOutlet />
      </Host>
    );
  },
  {
    tagName: 'body',
  }
);
