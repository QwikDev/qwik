import { component$, Host } from '@builder.io/qwik';

export default component$(() => {
  return (
    <Host>
      <h1>Welcome to the Docs!</h1>
      <p>
        <a href="/docs/overview">Overview</a>
      </p>
    </Host>
  );
});
