import { component$, Host } from '@builder.io/qwik';
import type { HeadComponent } from '@builder.io/qwik-city';

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

export const head: HeadComponent = () => {
  return (
    <>
      <title>About Us</title>
    </>
  );
};
