import { component$, Host } from '@builder.io/qwik';
import type { PageHeadFunction } from '@builder.io/qwik-city';

export default component$(() => {
  return <Host>about-us.tsx</Host>;
});

export const head: PageHeadFunction | void = () => {
  return {
    title: 'About Us',
    meta: {
      'og:title': 'About Us',
    },
  };
};
