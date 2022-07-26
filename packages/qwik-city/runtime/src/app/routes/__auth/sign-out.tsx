/**
 * Simple Auth For Testing Only!!!
 */

import type { EndpointHandler } from '~qwik-city-runtime';
import { signOut } from '../../auth/auth';

export const onGet: EndpointHandler = async ({ response }) => {
  const result = await signOut();
  response.headers.set('Set-Cookie', result.cookie);
  response.redirect('/sign-in');
};
