/**
 * Simple Auth For Testing Only!!!
 */

import type { RequestHandler } from '@builder.io/qwik-city';
import { signOut } from '../../../auth/auth';

export const onGet: RequestHandler = async ({ response, cookie }) => {
  signOut(cookie);
  throw response.redirect('/qwikcity-test/sign-in/');
};
