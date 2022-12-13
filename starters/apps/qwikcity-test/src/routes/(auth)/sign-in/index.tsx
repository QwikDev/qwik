/**
 * Simple Auth For Testing Only!!!
 */

import { component$ } from '@builder.io/qwik';
import { DocumentHead, RequestHandler, serverAction$ } from '@builder.io/qwik-city';
import { isUserAuthenticated, signIn } from '../../../auth/auth';

export const onGet: RequestHandler = async ({ redirect, cookie }) => {
  if (await isUserAuthenticated(cookie)) {
    throw redirect(301, '/qwikcity-test/dashboard/');
  }
};

export const signinAction = serverAction$(async (formData, { cookie, redirect, status }) => {
  const result = await signIn(formData, cookie);

  if (result.status === 'signed-in') {
    throw redirect(301, '/qwikcity-test/dashboard/');
  }

  status(403);
});

export default component$(() => {
  const signIn = signinAction.use();

  return (
    <div>
      <h1>Sign In</h1>

      <form method="post" action={signIn.actionPath}>
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
