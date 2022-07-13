import { component$, Host } from '@builder.io/qwik';
import { Content } from '@builder.io/qwik-city';

export const Body = component$(
  () => {
    return (
      <Host>
        <Content />
      </Host>
    );
  },
  {
    tagName: 'body',
  }
);
