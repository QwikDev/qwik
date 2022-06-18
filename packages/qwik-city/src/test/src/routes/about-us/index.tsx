import { component$, Host } from '@builder.io/qwik';
import type { PageHeadFunction } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <Host>
      <h1>About Us</h1>
      <p>
        <a href="/">Home</a>
      </p>
    </Host>
  );
});

export const head: PageHeadFunction | void = () => {
  return {
    title: 'About Us',
    meta: {
      'og:title': 'About Us',
    },
  };
};
