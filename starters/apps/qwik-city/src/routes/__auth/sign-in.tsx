import { component$, Host } from '@builder.io/qwik';
import type { HeadComponent } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <Host>
      <h1>Sign In</h1>
      <form>
        <label>
          <span>Username</span>
          <input type="text" />
        </label>
        <label>
          <span>Password</span>
          <input type="password" />
        </label>
        <button>Log In</button>
      </form>
    </Host>
  );
});

export const head: HeadComponent = () => {
  return (
    <>
      <title>Sign In</title>
    </>
  );
};
