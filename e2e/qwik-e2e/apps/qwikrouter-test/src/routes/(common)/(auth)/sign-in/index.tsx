/** Simple Auth For Testing Only!!! */

import { component$ } from '@qwik.dev/core';
import {
  type DocumentHead,
  Form,
  type RequestHandler,
  globalAction$,
  zod$,
} from '@qwik.dev/router';
import * as z from 'zod';
import { isUserAuthenticated, signIn } from '../../../../auth/auth';

export const onGet: RequestHandler = async ({ redirect, cookie }) => {
  if (await isUserAuthenticated(cookie)) {
    throw redirect(302, '/qwikrouter-test/dashboard/');
  }
};

export const useSigninAction = globalAction$(
  async (data, { cookie, redirect, fail }) => {
    const result = await signIn(data, cookie);

    if (result.status === 'signed-in') {
      throw redirect(302, '/qwikrouter-test/dashboard/');
    }

    // Expected failure: returned (not thrown) so it surfaces as `action.error` and the
    // form can render it inline with a 403 status.
    return fail(403, {
      message: ['Invalid username or password'],
    });
  },
  zod$(
    z
      .object({
        username: z.string(),
        password: z.string(),
        confirmPassword: z.string(),
      })
      .superRefine(({ confirmPassword, password }, ctx) => {
        if (confirmPassword !== password) {
          ctx.addIssue({
            code: 'custom',
            message: 'The passwords did not match',
          });
        }
      })
  )
);

export const useResetPasswordAction = globalAction$(
  ({ email }) => {
    console.warn('resetPasswordAction', email);
  },
  zod$({
    email: z.string().email(),
  })
);

export default component$(() => {
  const signIn = useSigninAction();
  const resetPassword = useResetPasswordAction();

  // `signIn.error` carries either the zod validation failure (with `fieldErrors`) or the
  // returned fail() payload (with only `message`) — narrow before reading `fieldErrors`.
  const fieldErrors =
    signIn.error && 'fieldErrors' in signIn.error ? signIn.error.fieldErrors : undefined;

  return (
    <div>
      <h1>Sign In</h1>

      <Form action={signIn} spaReset>
        {signIn.error?.message && <p style="color:red">{signIn.error.message}</p>}
        <label>
          <span>Username</span>
          <input name="username" type="text" autoComplete="username" required />
          {fieldErrors?.username && <p style="color:red">{fieldErrors.username}</p>}
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
          {fieldErrors?.password && <p style="color:red">{fieldErrors.password}</p>}
        </label>
        <label>
          <span>Confirm password</span>
          <input name="confirmPassword" type="password" autoComplete="current-password" required />
          {fieldErrors?.confirmPassword && <p style="color:red">{fieldErrors.confirmPassword}</p>}
        </label>
        <button data-test-sign-in>Sign In</button>
        <p>(Username: qwik, Password: dev)</p>
      </Form>

      <h2>Reset Password</h2>

      <form method="post" action={resetPassword.actionPath}>
        <label>
          <span>Email</span>
          <input name="email" type="text" required />
        </label>
        <button data-test-reset-password>Reset Password</button>
      </form>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Sign In',
};
