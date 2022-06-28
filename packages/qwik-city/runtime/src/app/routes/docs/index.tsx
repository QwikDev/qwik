import { component$, Host } from '@builder.io/qwik';
import type { HeadComponent } from '~qwik-city-runtime';

export default component$(() => {
  return (
    <Host>
      <h1>Welcome to the Docs!</h1>
    </Host>
  );
});

export const head: HeadComponent = () => {
  return (
    <>
      <title>Welcome!</title>
    </>
  );
};
