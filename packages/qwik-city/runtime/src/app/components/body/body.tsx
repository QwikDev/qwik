import { component$, Host } from '@builder.io/qwik';
import { Content } from '~qwik-city-runtime';

export const Body = component$(
  () => {
    return (
      <Host>
        <Content />
      </Host>
    );
  },
  { tagName: 'body' }
);
