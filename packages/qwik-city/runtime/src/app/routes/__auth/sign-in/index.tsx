/**
 * Simple Auth For Testing Only!!!
 */

import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead, RequestHandler } from '~qwik-city-runtime';
import { signIn, isUserAuthenticated } from '../../../auth/auth';

export default component$(() => {
  return (
    <Host>
      <h1>Sign In</h1>

      <form method="post">
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
      <p>(Username: qwik, Password: dev)</p>
    </Host>
  );
});

export const onGet: RequestHandler = async ({ request, response }) => {
  const isAuthenticated = await isUserAuthenticated(request.headers.get('cookie'));
  if (isAuthenticated) {
    response.redirect('/dashboard');
  }
};

export const onPost: RequestHandler = async ({ request, response }) => {
  const formdata = await request.formData();
  const result = await signIn(formdata);

  if (result.status === 'signed-in') {
    response.headers.set('Set-Cookie', result.cookie);
    response.redirect('/dashboard');
  } else {
    response.status = 403;
  }
};

export const head: DocumentHead = {
  title: 'Sign In',
};
