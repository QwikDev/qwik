/**
 * Simple Auth For Testing Only!!!
 */

import { component$, Host } from '@builder.io/qwik';
import type { DocumentHead, EndpointHandler } from '~qwik-city-runtime';
import { signIn, isUserAuthenticated } from '../../auth/auth';

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

export const onGet: EndpointHandler<EndpointData> = async ({ request }) => {
  const isAuthenticated = await isUserAuthenticated(request.headers.get('cookie'));
  if (isAuthenticated) {
    return {
      redirect: '/dashboard',
    };
  }
};

export const onPost: EndpointHandler<EndpointData> = async ({ request }) => {
  const formdata = await request.formData();
  const result = await signIn(formdata);

  if (result.status === 'signed-in') {
    return {
      headers: {
        'Set-Cookie': result.cookie,
      },
      redirect: '/dashboard',
    };
  }

  if (result.status === 'invalid') {
    return {
      status: 403,
    };
  }
};

export const head: DocumentHead = {
  title: 'Sign In',
};

export interface EndpointData {
  isAuthenticated: boolean;
}
