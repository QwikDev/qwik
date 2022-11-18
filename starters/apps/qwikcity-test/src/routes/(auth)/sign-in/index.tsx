/**
 * Simple Auth For Testing Only!!!
 */

import { component$ } from '@builder.io/qwik';
import type { DocumentHead, RequestHandler } from '@builder.io/qwik-city';
import { isUserAuthenticated, signIn } from '../../../auth/auth';

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

export const onGet: RequestHandler = async ({ response, cookie }) => {
  if (await isUserAuthenticated(cookie)) {
    throw response.redirect('/qwikcity-test/dashboard/');
  }
};

export const onPost: RequestHandler = async ({ request, response, cookie }) => {
  const formdata = await request.formData();
  const result = await signIn(formdata, cookie);

  if (result.status === 'signed-in') {
    throw response.redirect('/qwikcity-test/dashboard/');
  }

  response.status = 403;
};
