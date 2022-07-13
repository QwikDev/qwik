import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead } from '~qwik-city-runtime';

export default component$(() => {
  return (
    <Host>
      <h1>Sign In</h1>

      <form action="/api/on-sign-in" method="post">
        <label>
          <span>Username</span>
          <input name="username" type="text" />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" />
        </label>
        <button data-test-sign-in>Sign In</button>
      </form>
    </Host>
  );
});

export const head: DocumentHead = {
  title: 'Sign In',
};
