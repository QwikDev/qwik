import { component$, Host } from '@builder.io/qwik';

export default component$(() => {
  return (
    <Host>
      <h1>Dashboard</h1>
      <p>
        <a href="/sign-out" data-test-link="sign-out">
          Sign Out
        </a>
      </p>
    </Host>
  );
});
