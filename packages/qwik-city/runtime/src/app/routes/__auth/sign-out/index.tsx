/**
 * Simple Auth For Testing Only!!!
 */

import type { RequestHandler } from '~qwik-city-runtime';
import { signOut } from '../../../auth/auth';

export const onGet: RequestHandler = async ({ response }) => {
  const result = await signOut();
  response.headers.set('Set-Cookie', result.cookie);
  throw response.redirect('/sign-in');
};
