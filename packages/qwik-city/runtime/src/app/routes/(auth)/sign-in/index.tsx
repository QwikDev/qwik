/**
 * Simple Auth For Testing Only!!!
 */

import { component$ } from '@builder.io/qwik';
import type { DocumentHead, RequestHandler } from '~qwik-city-runtime';
import { signIn, isUserAuthenticated } from '../../../auth/auth';

export default component$(() => {
  return (
    <div>
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
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Sign In',
};

export const onGet: RequestHandler = async ({ request, response }) => {
  const isAuthenticated = await isUserAuthenticated(request.headers.get('cookie'));
  if (isAuthenticated) {
    throw response.redirect('/dashboard');
  }
};

export const onPost: RequestHandler = async ({ request, response }) => {
  const formdata = await request.formData();
  const result = await signIn(formdata);

  if (result.status === 'signed-in') {
    response.headers.set('Set-Cookie', result.cookie);
    throw response.redirect('/dashboard');
  }

  response.status = 403;
};
